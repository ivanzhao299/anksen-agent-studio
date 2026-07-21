#!/usr/bin/env node
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { FileBusinessSourceCredentialResolver } from "../lib/business-source-credential-resolver.mjs";
import { SmartParkWorkOrderReadAdapter,SmartParkWorkOrderSyncService } from "../lib/smart-park-work-order-source.mjs";

const connectorId=String(process.env.BUSINESS_SOURCE_CONNECTOR_ID??"").trim();
if(!connectorId)throw Object.assign(new Error("BUSINESS_SOURCE_CONNECTOR_ID_REQUIRED"),{code:"BUSINESS_SOURCE_CONNECTOR_ID_REQUIRED"});
const runtime=await createBusinessApplicationRuntime({repoRoot:process.cwd(),requirePostgres:true}),scope={organizationId:process.env.BUSINESS_SOURCE_ORGANIZATION_ID??"studio-org",workspaceId:process.env.BUSINESS_SOURCE_WORKSPACE_ID??"studio-workspace",userId:"business-source-runner"};
try{const readiness=await runtime.sourceGovernance.readiness(connectorId,scope);if(!process.argv.includes("--apply")){process.stdout.write(`${JSON.stringify({...readiness,mode:"READINESS_ONLY",credentialValuesRead:false},null,2)}\n`);process.exitCode=readiness.status==="READY"?0:2;}else{if(readiness.status!=="READY")throw Object.assign(new Error("BUSINESS_SOURCE_NOT_READY"),{code:"BUSINESS_SOURCE_NOT_READY"});const resolver=new FileBusinessSourceCredentialResolver(),adapter=new SmartParkWorkOrderReadAdapter({credentialResolver:id=>resolver.resolve(id)}),service=new SmartParkWorkOrderSyncService({connectorStore:runtime.connectorStore,governance:runtime.sourceGovernance,adapter}),result=await service.sync(connectorId,scope);process.stdout.write(`${JSON.stringify({...result,credentialValuesReturned:false},null,2)}\n`);}}finally{if(runtime.ownsPool)await runtime.pool.end();}
