export const studioDomains = Object.freeze([
  { id:"software-engineering",name:"软件工程",nameEn:"Software Engineering",maturity:"ACTIVE",icon:"</>",summary:"Web、服务端、API、测试、重构与完整软件交付。",skillTypes:["code_development","validation_testing"],keywords:["代码","开发","软件","前端","后端","api","test","bug","refactor","react","next"],nextMilestone:"在隔离 Git Fixture 完成首个真实 CODEX 领域 Pilot。" },
  { id:"enterprise-applications",name:"企业应用与 ERP",nameEn:"Enterprise Applications & ERP",maturity:"FOUNDATION",icon:"ERP",summary:"ERP、OA、CRM、园区及内部业务系统的模块化建设。",skillTypes:["code_development","data_integration","schema_inference"],keywords:["erp","oa","crm","企业应用","园区","业务系统","审批","工作流"],nextMilestone:"固化业务实体、权限、流程和迁移验收合同。" },
  { id:"data-analytics",name:"数据与分析",nameEn:"Data & Analytics",maturity:"FOUNDATION",icon:"BI",summary:"指标、报表、数据质量、分析模型与决策看板。",skillTypes:["spreadsheet_analysis","data_integration","validation_testing"],keywords:["数据","分析","指标","报表","bi","dashboard","统计","预测"],nextMilestone:"接入可追溯数据源与指标语义层。" },
  { id:"systems-integration",name:"系统集成与自动化",nameEn:"Systems Integration & Automation",maturity:"FOUNDATION",icon:"↔",summary:"第三方 API、消息、主数据、适配器和跨系统流程。",skillTypes:["data_integration","api_discovery","entity_mapping"],keywords:["集成","对接","接口","api integration","同步","webhook","飞书","用友"],nextMilestone:"建立 API 合同、凭据引用和回放 Fixture。" },
  { id:"mobile-engineering",name:"移动应用工程",nameEn:"Mobile Engineering",maturity:"FOUNDATION",icon:"▯",summary:"iOS、Android、跨端、模拟器验证和发布前检查。",skillTypes:["code_development","validation_testing"],keywords:["ios","android","移动端","手机","swift","kotlin","flutter","react native"],nextMilestone:"将现有 Mobile Stack Pack 接入统一领域合同。" },
  { id:"ai-agent-engineering",name:"AI 与 Agent 工程",nameEn:"AI & Agent Engineering",maturity:"PLANNED",icon:"AI",summary:"模型网关、Agent、RAG、评测、提示与安全运行策略。",skillTypes:["code_development","web_research","validation_testing"],keywords:["ai","agent","llm","rag","模型","智能体","prompt","评测"],nextMilestone:"定义模型评测、成本、隐私和回退合同。" },
  { id:"legacy-modernization",name:"遗留系统现代化",nameEn:"Legacy Modernization",maturity:"FOUNDATION",icon:"↻",summary:"授权发现、系统地图、Schema 推断、复刻与迁移。",skillTypes:["legacy_discovery","schema_inference","replica_planning","data_migration_mapping"],keywords:["旧系统","遗留","legacy","复刻","迁移","现代化","system map"],nextMilestone:"把发现、推断、计划和兼容评分串成单一任务图。" },
  { id:"quality-security",name:"质量与安全",nameEn:"Quality & Security",maturity:"PLANNED",icon:"✓",summary:"测试策略、质量门、安全检查、合规证据和缺陷治理。",skillTypes:["validation_testing","evolution_observer"],keywords:["质量","安全","测试","审计","合规","漏洞","qa","security"],nextMilestone:"建立风险分级检查器和不可绕过的验收证据。" },
  { id:"platform-operations",name:"平台与运维",nameEn:"Platform & Operations",maturity:"FOUNDATION",icon:"OPS",summary:"环境、可观测性、发布、恢复、容量与运行治理。",skillTypes:["code_development","validation_testing","evolution_observer"],keywords:["运维","平台","部署","发布","监控","恢复","devops","observability"],nextMilestone:"接入非生产环境演练和人工批准发布链。" },
  { id:"knowledge-automation",name:"知识与内容自动化",nameEn:"Knowledge & Content Automation",maturity:"FOUNDATION",icon:"DOC",summary:"文档、表格、演示、研究、知识整理和结构化交付。",skillTypes:["document_generation","spreadsheet_analysis","slide_generation","pdf_processing","web_research"],keywords:["文档","报告","表格","ppt","pdf","知识","研究","方案","内容"],nextMilestone:"统一多格式产物渲染、校验和版本追踪。" }
]);

export function getStudioDomain(id) { return studioDomains.find(domain => domain.id === id) ?? null; }

export function routeStudioDomain(goal, { explicitDomainId = null } = {}) {
  if (explicitDomainId) {
    const explicit = getStudioDomain(explicitDomainId);
    if (!explicit) throw Object.assign(new Error("DOMAIN_NOT_FOUND"), { code:"DOMAIN_NOT_FOUND" });
    return { domainId:explicit.id,confidence:1,source:"EXPLICIT",alternatives:[] };
  }
  const text = String(goal ?? "").toLowerCase();
  const scored = studioDomains.map(domain => ({ domainId:domain.id,score:domain.keywords.reduce((score, keyword) => score + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0) })).sort((a,b) => b.score-a.score || a.domainId.localeCompare(b.domainId));
  if (scored[0].score === 0) return { domainId:"software-engineering",confidence:.35,source:"FALLBACK",alternatives:[] };
  const best = scored[0], total = scored.reduce((sum,item) => sum+item.score,0);
  return { domainId:best.domainId,confidence:Number(Math.min(.98,.55+best.score/Math.max(total,1)*.4).toFixed(2)),source:"KEYWORD",alternatives:scored.slice(1,4).filter(item=>item.score>0) };
}

export function domainCenterSummary() {
  return { schemaVersion:1,total:studioDomains.length,active:studioDomains.filter(item=>item.maturity==="ACTIVE").length,foundation:studioDomains.filter(item=>item.maturity==="FOUNDATION").length,planned:studioDomains.filter(item=>item.maturity==="PLANNED").length,singleControlPlane:true,domains:studioDomains };
}
