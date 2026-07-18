#!/usr/bin/env node
import { NightShiftSessionService,smokeGoal } from "../lib/night-shift-smoke.mjs";
const mode=process.argv.includes("--daemon")?"daemon":"once",service=new NightShiftSessionService(),session=service.createSession({mode,maxRuntimeMs:10000,idleTimeoutMs:500,maxTasks:10});
const shutdown=()=>service.requestShutdown();process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);
await service.acceptGoal(session.id,smokeGoal);const report=await service.run(session.id);console.log(JSON.stringify(report,null,2));if(report.sessionStatus!=="SUCCEEDED")process.exitCode=1;
