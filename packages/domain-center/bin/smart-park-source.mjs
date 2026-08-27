#!/usr/bin/env node
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { FileBusinessSourceCredentialResolver } from "../lib/business-source-credential-resolver.mjs";
import { SmartParkWorkOrderReadAdapter,SmartParkWorkOrderSyncService,smartParkSourceCommandControls } from "../lib/smart-park-work-order-source.mjs";

async function main(){
  const{apply,connectorId,scope}=smartParkSourceCommandControls(process.argv.slice(2),process.env),runtime=await createBusinessApplicationRuntime({repoRoot:process.cwd(),requirePostgres:true,initializeSchema:false});
  try{
    const readiness=await runtime.sourceGovernance.readiness(connectorId,scope);
    if(!apply){process.stdout.write(`${JSON.stringify({...readiness,mode:"READINESS_ONLY",credentialValuesRead:false},null,2)}\n`);process.exitCode=readiness.status==="READY"?0:2;return;}
    if(readiness.status!=="READY")throw Object.assign(new Error("BUSINESS_SOURCE_NOT_READY"),{code:"BUSINESS_SOURCE_NOT_READY"});
    const resolver=new FileBusinessSourceCredentialResolver(),adapter=new SmartParkWorkOrderReadAdapter({credentialResolver:id=>resolver.resolve(id)}),service=new SmartParkWorkOrderSyncService({connectorStore:runtime.connectorStore,governance:runtime.sourceGovernance,adapter}),result=await service.sync(connectorId,scope);
    process.stdout.write(`${JSON.stringify({...result,credentialValuesReturned:false},null,2)}\n`);
  }finally{if(runtime.ownsPool)await runtime.pool.end();}
}

try{await main();}catch(error){const candidate=error?.code,code=typeof candidate==="string"&&/^(?:BUSINESS|SMART_PARK)_[A-Z0-9_]{2,80}$/.test(candidate)?candidate:"BUSINESS_SOURCE_COMMAND_FAILED";process.stderr.write(`${JSON.stringify({status:"FAILED",code})}\n`);process.exitCode=1;}
