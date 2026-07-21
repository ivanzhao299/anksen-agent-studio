import { readFile,stat } from "node:fs/promises";
import { resolve,sep } from "node:path";
const fail=code=>Object.assign(new Error(code),{code});
export class FileBusinessSourceCredentialResolver{
  constructor({baseDir=process.env.BUSINESS_SOURCE_CREDENTIAL_DIR??"/opt/anksen/business-source-credentials"}={}){this.baseDir=resolve(baseDir);}
  async resolve(referenceId){const id=String(referenceId??"");if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(id))throw fail("BUSINESS_SOURCE_CREDENTIAL_REFERENCE_INVALID");const path=resolve(this.baseDir,`${id}.json`);if(!path.startsWith(`${this.baseDir}${sep}`))throw fail("BUSINESS_SOURCE_CREDENTIAL_PATH_DENIED");const info=await stat(path).catch(()=>null);if(!info?.isFile()||(info.mode&0o077)!==0||info.size>16384)throw fail("BUSINESS_SOURCE_CREDENTIAL_FILE_UNSAFE");const value=JSON.parse(await readFile(path,"utf8"));if(typeof value.baseUrl!=="string"||typeof value.accessToken!=="string"||!value.accessToken)throw fail("BUSINESS_SOURCE_CREDENTIAL_FILE_INVALID");return{baseUrl:value.baseUrl,accessToken:value.accessToken};}
}
