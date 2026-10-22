import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, copyFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createCapabilityUploadStore } from './capability-upload-store.mjs';

const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };
const id = value => { if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(String(value ?? ''))) fail('MEDIA_ID_INVALID'); return String(value); };
const digest = value => createHash('sha256').update(value).digest('hex');
const types = { '.m4a':'audio/mp4','.flac':'audio/flac','.ogg':'audio/ogg','.aac':'audio/aac','.aiff':'audio/aiff','.aif':'audio/aiff','.mkv':'video/x-matroska','.m4v':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp' };
const operations = new Set(['separate','profile','voice','video']);
const clone = value => structuredClone(value);

// Business metadata only. Execution, leases, fencing and task status belong to ResidentWorkerBroker.
export class MediaWorkbench {
  constructor({ repoRoot, broker, enabled = false, workerId = 'mac-media-1', projectIds = [], clock = () => new Date() }) {
    this.root = resolve(repoRoot,'runtime/media-workbench'); this.repoRoot = repoRoot; this.broker = broker;
    this.enabled = enabled; this.workerId = workerId; this.projectIds = projectIds; this.clock = clock; this.serial = Promise.resolve();
    this.uploads = createCapabilityUploadStore({ repoRoot: this.root, allowedExtensions: Object.keys(types).map(x=>x.slice(1)), center: { stageAsset: async (_app,_project,path,name) => {
      const blobId = `blob-${randomUUID()}`, destination = resolve(this.root,'blobs',blobId + extname(name));
      await mkdir(resolve(this.root,'blobs'),{recursive:true,mode:0o700}); await copyFile(path,destination);
      return { blobId, extension:extname(name) };
    } } });
  }
  async load() { try { return JSON.parse(await readFile(resolve(this.root,'metadata.json'),'utf8')); } catch(e) { if(e.code !== 'ENOENT') throw e; return {uploads:{},blobs:{},runs:{},preferences:{},catalog:null}; } }
  async mutate(fn) { const next = this.serial.then(async()=>{ const s=await this.load(); const result=await fn(s); await mkdir(this.root,{recursive:true,mode:0o700}); const p=resolve(this.root,`metadata.${randomUUID()}.tmp`);await writeFile(p,JSON.stringify(s),{mode:0o600});await rename(p,resolve(this.root,'metadata.json'));return result; }); this.serial=next.catch(()=>{});return next; }
  actor(auth,projectId) {
    if(!this.enabled) fail('MEDIA_WORKBENCH_DISABLED',503);
    if(!auth.authenticated || !auth.user?.user_id) fail('AUTH_REQUIRED',401);
    id(projectId); const allowed=auth.project_allowlist??auth.membership?.project_allowlist??[];
    if(!this.projectIds.includes(projectId) || !(allowed.includes('*')||allowed.includes(projectId))) fail('MEDIA_PROJECT_FORBIDDEN',403);
    return {userId:auth.user.user_id,workspaceId:auth.workspace_id??'studio-workspace',organizationId:auth.organization_id??'studio-org',projectId};
  }
  key(actor) {return digest(JSON.stringify([actor.organizationId,actor.workspaceId,actor.projectId,actor.userId]));}
  own(row,actor) {if(!row || row.owner!==this.key(actor)) fail('MEDIA_OBJECT_NOT_FOUND',404);return row;}
  async initialize(actor,input) {
    const ext=extname(String(input.name??'')).toLowerCase();if(!types[ext]) fail('MEDIA_TYPE_UNSUPPORTED');
    const max=['.mp4','.mov','.webm','.mkv','.m4v'].includes(ext)?100*1024**2:20*1024**2;
    if(!Number.isSafeInteger(input.size)||input.size<1||input.size>max) fail('MEDIA_SIZE_INVALID');
    return this.mutate(async s=>{const u=await this.uploads.initialize({appId:'local-media',projectId:actor.projectId,name:`asset-${randomUUID()}${ext}`,size:input.size,sha256:input.sha256},{userId:actor.userId});s.uploads[u.upload_id]={owner:this.key(actor),name:String(input.name).replace(/[\x00-\x1f]/g,'').slice(0,180),upload:u};return u;});
  }
  async chunk(actor,uploadId,index,bytes) {return this.mutate(async s=>{this.own(s.uploads[id(uploadId)],actor);if(s.uploads[uploadId].blobId) fail('MEDIA_UPLOAD_COMPLETE',409);return this.uploads.putChunk(uploadId,index,bytes);});}
  async complete(actor,uploadId) {return this.mutate(async s=>{const row=this.own(s.uploads[id(uploadId)],actor);if(row.blobId)return clone(s.blobs[row.blobId]);const done=await this.uploads.complete(uploadId);const b={id:done.accepted.blobId,extension:done.accepted.extension,owner:row.owner,name:row.name,size:done.size,sha256:done.sha256};s.blobs[b.id]=b;row.blobId=b.id;return clone(b);});}
  blobPath(blob) { return resolve(this.root,'blobs',id(blob.id)+blob.extension); }
  async artifact(actor,blobId) {const s=await this.load(),b=this.own(s.blobs[id(blobId)],actor);return {path:this.blobPath(b),size:(await stat(this.blobPath(b))).size,contentType:types[b.extension]??'application/octet-stream'};}
  async device() { const d=await this.broker.dashboard(); const w=d.workers.find(x=>x.workerId===this.workerId && x.capabilities.includes('media.execute.v1'));return {online:Boolean(w&&w.heartbeatAgeMs<90000&&w.lifecycle?.status==='READY'),workerId:this.workerId,busy:Boolean(w?.activeTaskId)}; }
  async catalog(input) {
    if(!input || !Array.isArray(input.fields)||input.fields.length>100)fail('MEDIA_CATALOG_INVALID');
    // Do not project device paths, private local profiles or loading credentials onto the website.
    const fields=input.fields.map(({key,label,default:def,kind,group,minimum,maximum,step,options,hint,disabled,unavailable_reason})=>({key,label,default:def,kind,group,minimum,maximum,step,options,hint,disabled,unavailable_reason}));
    await this.mutate(s=>{const next={fields,loras:Array.isArray(input.loras)?input.loras.filter(x=>typeof x==='string'&&!x.includes('..')&&!x.startsWith('/')):[],model:'VoxCPM2'};const previous=s.catalog?{fields:s.catalog.fields,loras:s.catalog.loras??[],model:s.catalog.model}:null;if(JSON.stringify(next)!==JSON.stringify(previous))s.catalog={...next,updatedAt:this.clock().toISOString()};});
  }
  async dashboard(actor) {
    const s=await this.load(),d=await this.broker.dashboard(),runs=Object.values(s.runs).filter(x=>x.owner===this.key(actor));
    const items=runs.map(row=>{const task=d.tasks.find(t=>t.taskId===row.taskId),rawResult=task?.result?.evidence?.media??null,result=rawResult?.variants?{...rawResult,variants:rawResult.variants.filter(v=>v.status!=='FAILED'),failedVariants:rawResult.variants.filter(v=>v.status==='FAILED')}:rawResult;return {...row,status:task?.status??'QUEUED',stage:task?.status==='LEASED'?task.progressStage:null,result,error:task?.status==='FAILED'?task.result?.summary:null};});
    return {device:await this.device(),catalog:s.catalog,items,preference:s.preferences[this.key(actor)]??null};
  }
  async submit(actor,input) {
    if(!operations.has(input.operation))fail('MEDIA_OPERATION_INVALID');
    const requestId=id(input.requestId),owner=this.key(actor),taskId='media-'+digest(owner+':'+requestId).slice(0,40);
    return this.mutate(async s=>{
      if(s.runs[taskId])return clone(s.runs[taskId]);
      if(!(await this.device()).online)fail('MEDIA_DEVICE_OFFLINE',503);
      if((await this.broker.dashboard()).tasks.filter(t=>t.kind==='MEDIA'&&['QUEUED','LEASED'].includes(t.status)).length>=4)fail('MEDIA_ADMISSION_LIMIT',429);
      const p=clone(input.parameters??{});if(!p||Array.isArray(p)||typeof p!=='object')fail('MEDIA_PARAMETERS_INVALID');
      const assets=[];const getBlob=v=>{const b=this.own(s.blobs[id(v)],actor);assets.push({id:b.id,extension:b.extension,sha256:b.sha256,size:b.size});return b.id;};
      const profile=v=>{const row=this.own(s.runs[id(v)],actor);if(row.operation!=='profile')fail('MEDIA_PROFILE_INVALID');return row.taskId;};
      let spec={operation:input.operation,parameters:p};
      if(input.operation==='separate') spec.blobId=getBlob(input.blobId);
      if(input.operation==='profile') {
        if(!(String(input.name??'').trim().length>=1&&String(input.name).length<=40))fail('MEDIA_PROFILE_NAME_INVALID');
        if(!Number.isFinite(input.start)||!Number.isFinite(input.end)||input.start<0||input.end-input.start<3||input.end-input.start>30)fail('MEDIA_REFERENCE_RANGE_INVALID');
        const b=getBlob(input.blobId);if(s.blobs[b].extension!=='.wav')fail('MEDIA_PROFILE_REQUIRES_WAV');
        spec={...spec,blobId:b,name:input.name,start:input.start,end:input.end};
      }
      if(input.operation==='voice') {
        if(typeof input.text!=='string'||!input.text.trim()||input.text.length>2000)fail('MEDIA_TEXT_INVALID');
        delete p.prompt_profile_task;const profileTaskId=p.mode==='zero_shot'?null:profile(input.profileId);if(p.prompt_profile)p.prompt_profile_task=profile(p.prompt_profile);delete p.prompt_profile;
        spec={...spec,text:input.text,style:String(input.style??'').slice(0,200),profileTaskId,pair:input.pair===true};
      }
      if(input.operation==='video') {
        if(typeof input.prompt!=='string'||input.prompt.length<3||input.prompt.length>12000)fail('MEDIA_PROMPT_INVALID');
        if(!['text','image'].includes(input.mode)||!['1024x576','608x352','576x1024'].includes(input.size)||![56,124,243].includes(input.frames))fail('MEDIA_VIDEO_PARAMETERS_INVALID');
        spec={...spec,prompt:input.prompt,sound:String(input.sound??'').slice(0,2000),mode:input.mode,size:input.size,frames:input.frames,seed:input.seed??-1};if(input.mode==='image')spec.blobId=getBlob(input.blobId);
      }
      const row={taskId,owner,operation:input.operation,name:String(input.name??input.title??'').slice(0,80),createdAt:this.clock().toISOString(),assets};
      // Store a deterministic task reference before enqueue; retry resumes the same broker task.
      await this.broker.enqueue({taskId,projectId:actor.projectId,goal:`影音工作台：${input.operation}`,kind:'MEDIA',mode:'GOVERNED_WRITE',approved:true,media:{...spec,owner,assets},requiredWorkerId:this.workerId},{userId:actor.userId});
      s.runs[taskId]=row;return clone(row);
    });
  }
  async selected(actor,taskId,variant) {
    return this.mutate(async s=>{const row=this.own(s.runs[id(taskId)],actor),d=await this.broker.dashboard(),t=d.tasks.find(x=>x.taskId===taskId);if(row.operation!=='voice'||t?.status!=='SUCCEEDED')fail('MEDIA_SELECTION_NOT_READY',409);const result=t.result.evidence.media,choice=result.variants?.find(x=>x.variant===variant);if(choice?.status==='FAILED'||!choice?.blobId||!choice.parameters)fail('MEDIA_VARIANT_INVALID');this.own(s.blobs[choice.blobId],actor);const saved={taskId,variant,profileId:result.profileId,style:result.style,parameters:choice.parameters,selectedAt:this.clock().toISOString()};s.preferences[this.key(actor)]=saved;return clone(saved);});
  }
  async validateResult(workerId,taskId,input) {
    const t=await this.workerTask(workerId,taskId,input);if(input.status!=="SUCCEEDED")return;
    const s=await this.load(),r=input.evidence?.media;if(!r||typeof r!=="object")fail('MEDIA_RESULT_REQUIRED');
    const artifact=v=>{const b=s.blobs[id(v)];if(!b||b.taskId!==taskId||b.owner!==t.media.owner)fail('MEDIA_RESULT_ARTIFACT_INVALID');};
    if(t.media.operation==='profile'){artifact(r.previewBlobId);if(r.referenceSeconds!==t.media.end-t.media.start)fail('MEDIA_REFERENCE_RESULT_INVALID');}
    else if(t.media.operation==='voice'){
      if(r.profileId!==t.media.profileTaskId||r.style!==t.media.style||!Array.isArray(r.variants)||r.variants.length!==(t.media.pair?2:1))fail('MEDIA_VARIANTS_INVALID');
      let success=0;for(const [i,v]of r.variants.entries()){if(v.variant!==(i?'B':'A'))fail('MEDIA_VARIANT_INVALID');if(v.status==='FAILED'){if(typeof v.error!=='string'||v.blobId)fail('MEDIA_VARIANT_INVALID');continue;}if(v.status&&v.status!=='SUCCEEDED'||!Number.isInteger(v.parameters?.seed)||!Number.isFinite(v.duration)||v.duration<=0)fail('MEDIA_VARIANT_INVALID');artifact(v.blobId);success++;}if(!success||Boolean(r.partial)!==r.variants.some(v=>v.status==='FAILED'))fail('MEDIA_VARIANTS_INVALID');
    }else{artifact(r.blobId);if(!Number.isFinite(r.duration)||r.duration<=0)fail('MEDIA_DURATION_INVALID');if(t.media.operation==='video'&&(!r.hasAudio||`${r.width}x${r.height}`!==t.media.size||!Number.isFinite(r.fps)||Math.abs(r.fps-24)>.01))fail('MEDIA_VIDEO_RESULT_INVALID');}
  }
  async workerTask(workerId,taskId,input) {
    if(workerId!==this.workerId)fail('MEDIA_WORKER_FORBIDDEN',403);
    const d=await this.broker.dashboard(),t=d.tasks.find(x=>x.taskId===id(taskId));
    if(t?.kind!=='MEDIA'||t.requiredWorkerId!==workerId)fail('MEDIA_TASK_NOT_FOUND',404);
    await this.broker.renew(workerId,taskId,input);return t;
  }
  async workerAsset(workerId,taskId,input,blobId) {const t=await this.workerTask(workerId,taskId,input);if(!t.media.assets.some(x=>x.id===blobId))fail('MEDIA_ASSET_FORBIDDEN',403);const s=await this.load(),b=s.blobs[id(blobId)];if(b?.owner!==t.media.owner)fail('MEDIA_ASSET_FORBIDDEN',403);return {path:this.blobPath(b),size:b.size,contentType:types[b.extension]};}
  async workerOutput(workerId,taskId,input) {
    const t=await this.workerTask(workerId,taskId,input),auth={owner:t.media.owner};
    return this.mutate(async s=>{const ext=extname(String(input.name??'')).toLowerCase();if(!['.wav','.mp4'].includes(ext))fail('MEDIA_OUTPUT_TYPE_INVALID');const u=await this.uploads.initialize({appId:'media-output',projectId:t.projectId,name:`output-${randomUUID()}${ext}`,size:input.size,sha256:input.sha256});s.uploads[u.upload_id]={...auth,taskId,name:input.name,upload:u};return u;});
  }
  async workerChunk(workerId,taskId,input,uploadId,index,bytes) {await this.workerTask(workerId,taskId,input);return this.mutate(async s=>{if(s.uploads[id(uploadId)]?.taskId!==taskId)fail('MEDIA_OUTPUT_FORBIDDEN',403);return this.uploads.putChunk(uploadId,index,bytes);});}
  async workerCompleteUpload(workerId,taskId,input,uploadId) {await this.workerTask(workerId,taskId,input);return this.mutate(async s=>{const row=s.uploads[id(uploadId)];if(row?.taskId!==taskId)fail('MEDIA_OUTPUT_FORBIDDEN',403);if(row.blobId)return s.blobs[row.blobId];const done=await this.uploads.complete(uploadId),b={id:done.accepted.blobId,extension:done.accepted.extension,owner:row.owner,taskId,size:done.size,sha256:done.sha256,name:row.name};s.blobs[b.id]=b;row.blobId=b.id;return b;});}
}
