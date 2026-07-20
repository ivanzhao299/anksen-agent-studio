#!/usr/bin/env node
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { runEnterpriseBusinessAcceptance } from "../lib/enterprise-business-acceptance.mjs";

await ensurePostgresFixture();
const pool=createTestPool();
try{
  await createBusinessApplicationRuntime({repoRoot:process.cwd(),pool});
  const report=await runEnterpriseBusinessAcceptance({pool});
  console.log(JSON.stringify(report,null,2));
  if(report.status!=="PASS")process.exitCode=1;
}finally{await pool.end();}
