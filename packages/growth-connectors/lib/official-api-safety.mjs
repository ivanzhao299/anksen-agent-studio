const loopbackHosts=new Set(['127.0.0.1','localhost','[::1]']);
const hostnamePattern=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function assertOfficialApiConfiguration({endpoint,allowedHostnames,allowHttpForTest,enabled,requiresApproval,timeoutMs,maxResponseBytes,errorPrefix}){
  const target=new URL(endpoint);
  if(typeof enabled!=='boolean'||typeof requiresApproval!=='boolean')throw new TypeError(`${errorPrefix}_BOOLEAN_CONFIGURATION_REQUIRED`);
  if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw new TypeError(`${errorPrefix}_TIMEOUT_INVALID`);
  if(!Number.isInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>1024*1024)throw new TypeError(`${errorPrefix}_RESPONSE_LIMIT_INVALID`);
  if(target.username||target.password||target.search||target.hash)throw new Error(`${errorPrefix}_ENDPOINT_INVALID`);
  if(target.protocol!=='https:'&&!(allowHttpForTest===true&&target.protocol==='http:'&&loopbackHosts.has(target.hostname)))throw new Error(`${errorPrefix}_HTTPS_REQUIRED`);
  if(!Array.isArray(allowedHostnames)||allowedHostnames.length<1||allowedHostnames.length>50)throw new Error(`${errorPrefix}_HOST_ALLOWLIST_INVALID`);
  const normalizedHosts=allowedHostnames.map(value=>{if(typeof value!=='string')throw new Error(`${errorPrefix}_HOST_ALLOWLIST_INVALID`);const host=value.trim().toLowerCase();if(!hostnamePattern.test(host)&&!loopbackHosts.has(host))throw new Error(`${errorPrefix}_HOST_ALLOWLIST_INVALID`);return host;});
  if(new Set(normalizedHosts).size!==normalizedHosts.length)throw new Error(`${errorPrefix}_HOST_ALLOWLIST_INVALID`);
  if(!normalizedHosts.includes(target.hostname.toLowerCase()))throw new Error(`${errorPrefix}_HOST_DENIED`);
  return target;
}

export async function readBoundedJson(response,maxResponseBytes,errorPrefix){
  const contentType=String(response.headers?.get?.('content-type')??'').toLowerCase();
  if(!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/.test(contentType)){await cancelResponseBody(response);throw Object.assign(new Error(`${errorPrefix}_RESPONSE_CONTENT_TYPE_INVALID`),{code:`${errorPrefix}_RESPONSE_CONTENT_TYPE_INVALID`,retryable:false});}
  const declared=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>maxResponseBytes){await cancelResponseBody(response);throw Object.assign(new Error(`${errorPrefix}_RESPONSE_TOO_LARGE`),{code:`${errorPrefix}_RESPONSE_TOO_LARGE`,retryable:false});}
  if(!response.body?.getReader){const text=await response.text();if(Buffer.byteLength(text)>maxResponseBytes)throw Object.assign(new Error(`${errorPrefix}_RESPONSE_TOO_LARGE`),{code:`${errorPrefix}_RESPONSE_TOO_LARGE`,retryable:false});try{return JSON.parse(text);}catch{throw Object.assign(new Error(`${errorPrefix}_RESPONSE_JSON_INVALID`),{code:`${errorPrefix}_RESPONSE_JSON_INVALID`,retryable:false});}}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxResponseBytes){await reader.cancel().catch(()=>{});throw Object.assign(new Error(`${errorPrefix}_RESPONSE_TOO_LARGE`),{code:`${errorPrefix}_RESPONSE_TOO_LARGE`,retryable:false});}chunks.push(value);}}
  finally{reader.releaseLock?.();}
  const text=new TextDecoder().decode(Buffer.concat(chunks.map(value=>Buffer.from(value))));try{return JSON.parse(text);}catch{throw Object.assign(new Error(`${errorPrefix}_RESPONSE_JSON_INVALID`),{code:`${errorPrefix}_RESPONSE_JSON_INVALID`,retryable:false});}
}

export const safeRetryAfter=value=>typeof value==='string'&&/^\d{1,8}$/.test(value)?value:null;
export async function cancelResponseBody(response){try{await response?.body?.cancel?.();}catch{}}

export async function fetchWithTimeout(fetchImpl,target,options,timeoutMs){const controller=new AbortController();let timer;try{return await Promise.race([Promise.resolve().then(()=>fetchImpl(target,{...options,signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const error=new Error('FETCH_TIMEOUT');error.name='AbortError';reject(error);},timeoutMs);})]);}finally{clearTimeout(timer);}}

export function assertCredentialToken(value,errorPrefix){if(typeof value!=='string'||value.length<1||value.length>8192||/[\u0000-\u001f\u007f]/.test(value))throw Object.assign(new Error(`${errorPrefix}_CREDENTIAL_UNAVAILABLE`),{code:`${errorPrefix}_CREDENTIAL_UNAVAILABLE`,retryable:false});return value;}

export async function resolveCredentialWithTimeout(resolver,input,timeoutMs,errorPrefix){let timer;try{return await Promise.race([Promise.resolve().then(()=>resolver(input)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(`${errorPrefix}_CREDENTIAL_TIMEOUT`),{code:`${errorPrefix}_CREDENTIAL_TIMEOUT`,retryable:true})),timeoutMs);})]);}catch(error){if(error?.code===`${errorPrefix}_CREDENTIAL_TIMEOUT`)throw error;throw Object.assign(new Error(`${errorPrefix}_CREDENTIAL_RESOLUTION_FAILED`),{code:`${errorPrefix}_CREDENTIAL_RESOLUTION_FAILED`,retryable:true});}finally{clearTimeout(timer);}}

export function assertBoundedOutboundPayload(value,errorPrefix){const invalid=()=>{throw Object.assign(new Error(`${errorPrefix}_PAYLOAD_INVALID`),{code:`${errorPrefix}_PAYLOAD_INVALID`,retryable:false});};let nodes=0;const visit=(item,depth)=>{nodes+=1;if(nodes>500||depth>4)invalid();if(item===null||typeof item==='boolean')return item;if(typeof item==='number'){if(!Number.isFinite(item))invalid();return item;}if(typeof item==='string'){if(item.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item)||/(?:^sk-|^gh[pousr]_|bearer\s|password\s*=|token\s*=|api[_-]?key\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(item))invalid();return item;}if(Array.isArray(item)){if(item.length>50)invalid();return item.map(entry=>visit(entry,depth+1));}if(typeof item==='object'&&Object.getPrototypeOf(item)===Object.prototype){const entries=Object.entries(item);if(entries.length>50)invalid();return Object.fromEntries(entries.map(([key,entry])=>{if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)||/(?:secret|password|token|api[_-]?key|credential)/i.test(key))invalid();return[key,visit(entry,depth+1)];}));}invalid();};const result=visit(value??{},0);if(Buffer.byteLength(JSON.stringify(result))>16384)invalid();return result;}
