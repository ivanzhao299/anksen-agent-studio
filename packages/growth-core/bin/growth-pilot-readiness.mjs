#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {defineTenantPack} from '../lib/tenant-kit.mjs';
import {assessGrowthPilotReadiness} from '../lib/pilot-readiness.mjs';

const tenant=defineTenantPack(JSON.parse(await readFile(new URL('../examples/kingturf.tenant-pack.json',import.meta.url),'utf8'))),snapshot=JSON.parse(await readFile(new URL('../examples/kingturf.pilot-readiness.json',import.meta.url),'utf8')),report=assessGrowthPilotReadiness({tenantPack:tenant,...snapshot});
if(report.status!=='PILOT_ACTIVATION_BLOCKED'||!report.implementationReady||report.activationReady||!report.blockers.includes('EXPLICIT_PRODUCTION_AUTHORIZATION'))throw new Error(`GROWTH_PILOT_READINESS_UNEXPECTED ${JSON.stringify(report)}`);
console.log(JSON.stringify(report,null,2));
