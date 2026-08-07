import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const safe=/^[a-z0-9][a-z0-9._-]{0,79}$/i;
const secretPatterns=[/-----BEGIN [^-]*PRIVATE KEY-----/i,/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/i,/\bpassword\s*[:=]/i,/\btoken\s*[:=]/i];
export class MemPalaceAdapterError extends Error{constructor(code,message=code){super(message);this.code=code;}}
const ensureId=(value,field)=>{const text=String(value??"");if(!safe.test(text))throw new MemPalaceAdapterError("MEMORY_SCOPE_INVALID",field);return text;};
const within=(root,path)=>{const rel=relative(root,path);return rel===""||(!rel.startsWith("..")&&!isAbsolute(rel));};
export function redactMemoryText(value){let text=String(value??""),findings=0;for(const pattern of secretPatterns)text=text.replace(new RegExp(pattern.source,"gi"),()=>{findings+=1;return"[REDACTED]";});return{text,findings,sha256:createHash("sha256").update(text).digest("hex")};}

export class MemPalaceRuntimeAdapter{
  constructor({root,cli="mempalace",enabled=false,allowWrites=false,runner=(command,args,options)=>spawnSync(command,args,options)}={}){this.root=resolve(root);this.cli=cli;this.enabled=enabled;this.allowWrites=allowWrites;this.runner=runner;}
  scope(input){const organizationId=ensureId(input.organizationId,"organizationId"),workspaceId=ensureId(input.workspaceId,"workspaceId"),projectId=ensureId(input.projectId,"projectId"),path=resolve(this.root,organizationId,workspaceId,projectId);if(!within(this.root,path))throw new MemPalaceAdapterError("MEMORY_SCOPE_ESCAPE");return{organizationId,workspaceId,projectId,path,wing:`${organizationId}--${workspaceId}--${projectId}`};}
  health(){if(!this.enabled)return{status:"DISABLED",authoritative:false};const out=this.runner(this.cli,["--version"],{encoding:"utf8",shell:false,timeout:5000});return{status:out.status===0?"HEALTHY":"NOT_CONFIGURED",authoritative:false,version:String(out.stdout||out.stderr||"").trim()};}
  environment(scope){return{PATH:process.env.PATH??"",MEMPALACE_PALACE_PATH:scope.path,MEMPALACE_BACKEND:"sqlite_exact"};}
  async search(input){if(!this.enabled)throw new MemPalaceAdapterError("MEMORY_ADAPTER_DISABLED");const scope=this.scope(input),query=String(input.query??"").trim();if(!query||query.length>2000)throw new MemPalaceAdapterError("MEMORY_QUERY_INVALID");const out=this.runner(this.cli,["search",query,"--wing",scope.wing,"--results",String(Math.min(Math.max(Number(input.limit??5),1),20))],{encoding:"utf8",shell:false,timeout:30000,env:this.environment(scope),maxBuffer:2*1024*1024});if(out.status!==0)throw new MemPalaceAdapterError("MEMORY_SEARCH_FAILED",String(out.stderr).slice(0,500));return{scope:{...scope,path:undefined},authoritative:false,resultsText:String(out.stdout??"")};}
  async remember(input){if(!this.enabled)throw new MemPalaceAdapterError("MEMORY_ADAPTER_DISABLED");if(!this.allowWrites)throw new MemPalaceAdapterError("MEMORY_WRITE_NOT_APPROVED");const scope=this.scope(input),memory=redactMemoryText(input.text);if(!memory.text.trim()||memory.text.length>100000)throw new MemPalaceAdapterError("MEMORY_CONTENT_INVALID");const inbox=resolve(scope.path,"studio-inbox"),file=resolve(inbox,`${memory.sha256}.md`);if(!within(inbox,file))throw new MemPalaceAdapterError("MEMORY_SCOPE_ESCAPE");await mkdir(inbox,{recursive:true,mode:0o700});await writeFile(file,memory.text,{encoding:"utf8",mode:0o600,flag:"wx"}).catch(error=>{if(error.code!=="EEXIST")throw error;});const out=this.runner(this.cli,["mine",inbox,"--wing",scope.wing,"--agent","anksen-studio","--limit","1"],{encoding:"utf8",shell:false,timeout:30000,env:this.environment(scope),maxBuffer:1024*1024});if(out.status!==0)throw new MemPalaceAdapterError("MEMORY_WRITE_FAILED",String(out.stderr).slice(0,500));return{scope:{...scope,path:undefined},authoritative:false,redactionFindings:memory.findings,contentHash:memory.sha256};}
}
export const memPalaceIntegrationDecision=Object.freeze({mode:"DERIVED_INDEX_ADAPTER",authoritative:false,automaticMining:false,defaultEnabled:false,defaultWrites:false});
