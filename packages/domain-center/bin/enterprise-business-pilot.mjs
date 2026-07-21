#!/usr/bin/env node
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { runEnterpriseBusinessPilot } from "../lib/enterprise-business-pilot.mjs";

const runtime=await createBusinessApplicationRuntime({repoRoot:process.cwd(),requirePostgres:true});
try{const report=await runEnterpriseBusinessPilot({runtime,scope:{organizationId:"enterprise-pilot",workspaceId:"isolated-pilot",projectId:"anksen-agent-studio",userId:"pilot-operator"}});process.stdout.write(`${JSON.stringify(report,null,2)}\n`);if(report.status!=="COMPLETED")process.exitCode=1;}finally{if(runtime.ownsPool)await runtime.pool.end();}
