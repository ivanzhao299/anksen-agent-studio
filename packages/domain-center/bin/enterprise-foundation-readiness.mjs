#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { evaluateEnterpriseFoundationReadiness,enterpriseFoundationRuntimeArtifacts } from "../lib/enterprise-foundation-readiness.mjs";
import { consoleWebRoutes } from "../../../apps/console/web/routes.mjs";
const policy=JSON.parse(await readFile(new URL("../../access-center/examples/access-policy.example.json",import.meta.url),"utf8")),report=evaluateEnterpriseFoundationReadiness({roles:policy.roles,routes:consoleWebRoutes,runtimeArtifacts:enterpriseFoundationRuntimeArtifacts});
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);if(report.status!=="READY")process.exitCode=1;
