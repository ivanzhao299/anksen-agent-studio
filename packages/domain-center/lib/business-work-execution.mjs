const taskStatus=(task)=>String(task.taskStatus??"").toUpperCase();

export function projectBusinessWorkExecution({workItem,tasks=[],session=null}={}) {
  if(!workItem)return null;
  const statuses=tasks.map(taskStatus),count=(values)=>statuses.filter(status=>values.includes(status)).length,total=tasks.length;
  const succeeded=count(["SUCCEEDED"]),failed=count(["FAILED","CANCELLED"]),blocked=count(["BLOCKED"]),running=count(["CLAIMED","RUNNING"]),queued=count(["PENDING","QUEUED","READY"]);
  let phase="AWAITING_DISPATCH";
  if(workItem.assignmentType!=="AGENT")phase="MANUAL";
  else if(workItem.status==="CANCELLED")phase="CANCELLED";
  else if(workItem.status==="BLOCKED"||failed>0||blocked>0||["FAILED","BLOCKED"].includes(session?.status))phase="BLOCKED";
  else if(workItem.status==="COMPLETED"||session?.status==="SUCCEEDED"||(total>0&&succeeded===total))phase="COMPLETED";
  else if(running>0)phase="RUNNING";
  else if(queued>0)phase="QUEUED";
  else if(workItem.kernelGoalId||workItem.status==="RUNNING")phase="STARTING";
  const currentStages=tasks.filter(task=>taskStatus(task)!=="SUCCEEDED").slice(0,3).map(task=>({stageId:task.stageId??task.taskKey??null,title:task.title??null,status:task.taskStatus??null,businessSkillId:task.businessSkillId??null,agentId:task.agentId??null,workerKey:task.runner?.workerKey??task.plannedWorker??null,runtimeType:task.runner?.runtimeType??task.runtimeResult?.runtimeType??null}));
  const report=session?.report,number=value=>Number(value??0);
  const morningReport=report?{sessionStatus:report.sessionStatus??session.status,goalStatus:report.goalStatus??null,totalTasks:number(report.totalTasks),succeededTasks:number(report.succeededTasks),failedTasks:number(report.failedTasks),blockedTasks:number(report.blockedTasks),attemptCount:number(report.attemptCount),schedulerTickCount:number(report.schedulerTickCount),workerClaimCount:number(report.workerClaimCount),runtimeExecutionCount:number(report.runtimeExecutionCount),startedAt:report.startedAt??session.startedAt??null,finishedAt:report.finishedAt??session.finishedAt??null,errorCount:Array.isArray(report.errorSummary)?report.errorSummary.length:number(report.errorCount)}:null;
  return{phase,source:session?"AUTONOMOUS_KERNEL":"BUSINESS_WORK_STATE",progress:{total,succeeded,failed,blocked,running,queued,percent:total?Math.round(succeeded/total*100):0},currentStages,session:session?{status:session.status,schedulerTickCount:Number(session.schedulerTickCount??0),workerClaimCount:Number(session.workerClaimCount??0),runtimeExecutionCount:Number(session.runtimeExecutionCount??0),startedAt:session.startedAt??null,finishedAt:session.finishedAt??null,updatedAt:session.updatedAt??null,errorCount:Array.isArray(session.errorSummary)?session.errorSummary.length:0}:null,morningReport,resultAvailable:Boolean(workItem.resultRef)};
}
