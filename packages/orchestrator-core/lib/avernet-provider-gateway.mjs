import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const digest = value => createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
const safeEqual = (a, b) => { const left=Buffer.from(String(a)),right=Buffer.from(String(b));return left.length===right.length&&timingSafeEqual(left,right); };
export class AvernetGatewayError extends Error { constructor(code,message=code,status=400,retryable=false){super(message);this.code=code;this.status=status;this.retryable=retryable;} }

export class FileAvernetBridgeStore {
  constructor(path){this.path=resolve(path);this.value=null;this.chain=Promise.resolve();}
  async load(){if(this.value)return this.value;try{this.value=JSON.parse(await readFile(this.path,"utf8"));}catch{this.value={schemaVersion:1,inbox:{},sessions:{},outbox:{}};}return this.value;}
  async transaction(work){this.chain=this.chain.then(async()=>{const value=await this.load(),result=await work(value),temporary=`${this.path}.${process.pid}.${randomUUID()}.tmp`;await mkdir(dirname(this.path),{recursive:true});await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,{encoding:"utf8",mode:0o600});await rename(temporary,this.path);return result;});return this.chain;}
  async getInbox(id){return (await this.load()).inbox[id]??null;}
  async putInbox(record){return this.transaction(value=>{value.inbox[record.id]=record;return record;});}
  async session(key){return (await this.load()).sessions[key]??null;}
  async putSession(key,record){return this.transaction(value=>{value.sessions[key]=record;return record;});}
  async enqueue(event){return this.transaction(value=>{value.outbox[event.eventId]=event;return event;});}
  async pending(){return Object.values((await this.load()).outbox).filter(item=>item.status!=="DELIVERED");}
  async delivered(eventId){return this.transaction(value=>{if(value.outbox[eventId]){value.outbox[eventId].status="DELIVERED";value.outbox[eventId].deliveredAt=new Date().toISOString();}return value.outbox[eventId];});}
}

export class AvernetProviderGateway {
  constructor({studioGateway,store,providerId="anksen-studio",providerToken,protocolVersions=[1,2],now=()=>new Date()}){if(!studioGateway||!store||!providerToken)throw new AvernetGatewayError("GATEWAY_CONFIG_INVALID","Studio Gateway, store and provider token are required",500);this.studioGateway=studioGateway;this.store=store;this.providerId=providerId;this.providerToken=providerToken;this.protocolVersions=protocolVersions;this.now=now;}
  authenticate(headers={}){const token=String(headers.authorization??"").replace(/^Bearer\s+/i,"");if(!token||!safeEqual(token,this.providerToken))throw new AvernetGatewayError("unauthorized","Invalid Avernet provider token",401);const version=Number(headers["x-bcn-protocol-version"]??2);if(!this.protocolVersions.includes(version))throw new AvernetGatewayError("unsupported_protocol","Unsupported BCN protocol version",400);return version;}
  validate(input){const id=String(input?.id??"").trim(),method=String(input?.method??"").trim(),params=input?.params??{};if(!id||id.length>160)throw new AvernetGatewayError("invalid_request","id is required");if(!["chat.send","chat.inject","chat.abort","chat.history"].includes(method))throw new AvernetGatewayError("unsupported_method",method,501);const providerBotRef=String(params.provider_bot_ref??"").trim(),sessionId=String(params.session_id??"").trim();if(!providerBotRef||!sessionId)throw new AvernetGatewayError("invalid_request","provider_bot_ref and session_id are required");return{id,method,params,providerBotRef,sessionId,payloadDigest:digest({method,params})};}
  async handle(input,{headers={},actor={}}={}){const protocolVersion=this.authenticate(headers),request=this.validate(input),existing=await this.store.getInbox(request.id);if(existing){if(existing.payloadDigest!==request.payloadDigest)throw new AvernetGatewayError("idempotency_conflict","Request id was reused with a different payload",409);return existing.response;}
    let response;
    if(request.method==="chat.send")response=await this.send(request,actor);
    else if(request.method==="chat.inject")response=await this.inject(request,actor);
    else if(request.method==="chat.history")response=await this.history(request);
    else response=await this.abort(request,actor);
    await this.store.putInbox({id:request.id,payloadDigest:request.payloadDigest,method:request.method,providerBotRef:request.providerBotRef,sessionId:request.sessionId,response,protocolVersion,receivedAt:this.now().toISOString()});return response;
  }
  async send(request,actor){const text=String(request.params.message?.text??request.params.text??"").trim();if(!text)throw new AvernetGatewayError("invalid_request","message text is required");const projectId=String(request.params.metadata?.project_id??"").trim();if(!projectId)throw new AvernetGatewayError("project_required","Explicit project_id is required for Studio execution",403);const context={method:"POST",pathname:"/api/v1/goals",headers:{},body:{},sessionContext:{authenticated:true,user:{user_id:actor.userId??`avernet:${this.providerId}`},organizationId:actor.organizationId,workspaceId:actor.workspaceId,projectIds:actor.projectIds??[projectId],capabilities:["autopilot.plan"]}};
    if(!Array.isArray(actor.projectIds)||actor.projectIds.length===0||!actor.projectIds.includes(projectId))throw new AvernetGatewayError("project_access_denied","Avernet principal is not authorized for the requested project",403);
    const result=await this.studioGateway.createGoal({title:text.slice(0,160),description:text,projectId,organizationId:actor.organizationId,workspaceId:actor.workspaceId,idempotencyKey:`avernet:${request.id}`,constraints:["Avernet cannot bypass Studio Access Center, Runtime, Git or release gates."],acceptanceCriteria:Array.isArray(request.params.metadata?.acceptance_criteria)?request.params.metadata.acceptance_criteria:[]},context);const runId=request.id,session={sessionId:request.sessionId,providerBotRef:request.providerBotRef,projectId,goal:result.data,updatedAt:this.now().toISOString()};await this.store.putSession(`${request.providerBotRef}:${request.sessionId}`,session);await this.store.enqueue({eventId:randomUUID(),runId,state:"accepted",sessionId:request.sessionId,providerBotRef:request.providerBotRef,status:"PENDING",createdAt:this.now().toISOString()});return{ok:true,run_id:runId,state:"accepted",studio:result.data};}
  async inject(request,actor){const key=`${request.providerBotRef}:${request.sessionId}`,session=await this.store.session(key);await this.store.putSession(key,{...(session??{sessionId:request.sessionId,providerBotRef:request.providerBotRef}),injections:[...(session?.injections??[]),{text:String(request.params.message?.text??request.params.text??""),actorId:actor.userId??"avernet",at:this.now().toISOString()}],updatedAt:this.now().toISOString()});return{ok:true,injected:true,inference_started:false};}
  async history(request){const session=await this.store.session(`${request.providerBotRef}:${request.sessionId}`);return{ok:true,messages:session?.injections??[],studio_goal:session?.goal??null};}
  async abort(request,actor){const session=await this.store.session(`${request.providerBotRef}:${request.sessionId}`);if(!session)return{ok:true,aborted:false,reason:"session_not_found"};if(typeof this.studioGateway.executionCenter.cancelGoal!=="function")throw new AvernetGatewayError("cancel_not_supported","Studio cancellation port is not available",503,true);await this.studioGateway.executionCenter.cancelGoal(session.goal?.goalId??session.goal?.id,{userContext:actor});return{ok:true,aborted:true};}
  botManifest(){return{provider_id:this.providerId,protocol_versions:this.protocolVersions,bots:[{provider_bot_ref:"studio-software-engineering",summary:"Governed software engineering through ANKSEN Studio",domains:["software-engineering"],skills:["plan","implement","validate","review"],scopes:["project-explicit","no-direct-release"]}]};}
}
