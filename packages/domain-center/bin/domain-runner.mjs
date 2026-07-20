#!/usr/bin/env node
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";
import { PersistentDomainWorkflowService } from "../lib/persistent-domain-workflow.mjs";

await ensurePostgresFixture();
const pool=createTestPool();
if(!(await pool.query("SELECT to_regclass('ad_night_shift_session') ok")).rows[0].ok)await migrate(pool,"up");
const service=new PersistentDomainWorkflowService(pool,{registry:await loadDomainRuntimeRegistry()});
let stopping=false;
const stop=()=>{if(stopping)return;stopping=true;service.requestShutdown();};
process.on("SIGINT",stop);process.on("SIGTERM",stop);
try{console.log(JSON.stringify({status:"ONLINE",runnerType:"DOMAIN_WORKFLOW",runtime:"CONTROLLED_STUB",database:"ISOLATED_POSTGRESQL",pid:process.pid,startedAt:new Date().toISOString()}));const report=await service.runDaemon({pollMs:1000,idleTimeoutMs:24*60*60*1000,maxRuntimeMs:24*60*60*1000});console.log(JSON.stringify(report));}finally{await pool.end();}
