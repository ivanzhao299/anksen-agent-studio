#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256, validatePilotEvidence } from "../lib/autonomous-development-operations.mjs";

const repoRoot=resolve(new URL("../../..",import.meta.url).pathname),output=resolve(repoRoot,"runtime/autonomous-development/v3-pilot-report.json"),at=new Date().toISOString();
const cases=[
  ["success-a","pilot-a","AWAITING_DIFF_APPROVAL"],["success-b","pilot-b","AWAITING_DIFF_APPROVAL"],["repair-pass","pilot-a","AWAITING_DIFF_APPROVAL"],["cancel","pilot-b","CANCELLED"],["safe-restart","pilot-a","AWAITING_DIFF_APPROVAL"],["unsafe-recovery","pilot-b","RECOVERY_REQUIRED"],["scope-drift-rejected","pilot-a","FAILED"],["approval-expired","pilot-b","FAILED"],["budget-exhausted","pilot-a","FAILED"],["maintenance-window","pilot-b","CANCELLED"],
];
const jobs=cases.map(([id,projectId,status],index)=>({id:`v3-${id}`,projectId,status,allowedPaths:["src"],changedPaths:id==="scope-drift-rejected"?[]:["src/pilot.js"],agentInstances:[],artifacts:[{id:"evidence",sha256:sha256(`${id}:${at}`)}],delivery:{automaticActions:{commit:false,push:false,merge:false,deploy:false}},scenario:{repairUsed:id==="repair-pass",cancelled:id==="cancel",safeRestart:id==="safe-restart",recoveryBlocked:id==="unsafe-recovery",scopeDriftRejected:id==="scope-drift-rejected",approvalExpired:id==="approval-expired",budgetExhausted:id==="budget-exhausted",maintenanceWindow:id==="maintenance-window"},index}));
const validation=validatePilotEvidence(jobs),report={schemaVersion:1,executionMode:"CONTROLLED_POLICY_PILOT",generatedAt:at,status:validation.status,validation,jobs,note:"This ten-case pilot exercises governance policy deterministically. It does not replace the existing real four-role Codex proof or claim ten real Codex executions."};
await mkdir(resolve(output,".."),{recursive:true});await writeFile(output,`${JSON.stringify(report,null,2)}\n`,`utf8`);console.log(JSON.stringify(report,null,2));
