(()=>{
  const root=document.getElementById("work-execution-live");if(!root)return;
  const escape=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const labels={AWAITING_DISPATCH:"等待派发",STARTING:"正在启动",QUEUED:"队列中",RUNNING:"执行中",BLOCKED:"已阻塞",COMPLETED:"已完成",CANCELLED:"已取消",MANUAL:"人工处理"};
  const className=phase=>phase==="COMPLETED"?"pass":phase==="BLOCKED"?"blocked":["RUNNING","QUEUED","STARTING"].includes(phase)?"pending":"local";
  let timer=null;
  async function load(){
    const response=await fetch("/api/work",{cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.reason||"在线执行状态不可用");
    const items=body.items.filter(item=>item.assignmentType==="AGENT"&&item.execution);
    root.innerHTML=items.length?'<div class="simple-list">'+items.map(item=>{const execution=item.execution,progress=execution.progress,current=execution.currentStages?.[0];return '<a class="simple-row" href="'+escape(item.businessObject.href)+'"><div><strong>'+escape(item.title)+'</strong><small>'+(current?'当前：'+escape(current.stageId)+' · Skill '+escape(current.businessSkillId||"—")+' · Agent '+escape(current.agentId||"—"):'暂无活动阶段')+'</small></div><div><span class="status-label '+className(execution.phase)+'">'+escape(labels[execution.phase]||execution.phase)+'</span><small>'+escape(progress.succeeded)+' / '+escape(progress.total)+' 阶段 · '+escape(progress.percent)+'% · '+escape(execution.source)+'</small></div></a>';}).join("")+'</div>':'<div class="empty-state"><strong>当前没有 Agent 在线工作</strong>委派后的队列、执行、阻塞与完成状态会显示在这里。</div>';
    const active=items.some(item=>["STARTING","QUEUED","RUNNING"].includes(item.execution.phase));clearTimeout(timer);if(active)timer=setTimeout(()=>load().catch(showError),3000);
  }
  const showError=error=>{root.innerHTML='<div class="empty-state"><strong>在线状态读取失败</strong>'+escape(error.message)+'</div>';};
  window.addEventListener("DOMContentLoaded",()=>load().catch(showError));document.getElementById("work-refresh")?.addEventListener("click",()=>setTimeout(()=>load().catch(showError),150));
})();
