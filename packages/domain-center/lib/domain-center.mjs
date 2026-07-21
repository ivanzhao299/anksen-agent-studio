import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { professionalBusinessSkillContracts } from "./professional-business-skill-runner.mjs";
import { ProfessionalRunnerCapabilityRegistry } from "../../skill-router/lib/professional-runner-capabilities.mjs";
import { implementedProfessionalAdapterIds } from "../../skill-router/lib/professional-media-adapters.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const paths = {
  skills: resolve(repoRoot, "packages/skill-router/registry/skill-registry.json"),
  skillRules: resolve(repoRoot, "packages/skill-router/registry/skill-router-rules.json"),
  agents: resolve(repoRoot, "packages/orchestrator-core/schemas/agent-registry/agent-registry.example.json"),
  workers: resolve(repoRoot, "packages/worker-pool/examples/worker-registry.example.json")
};

const stage = (key, title, skillType, preferredAgentId, dependsOn = null, businessSkillId = null) =>
  Object.freeze({ key, title, businessSkillId: businessSkillId ?? key.toLowerCase(), skillType, preferredAgentId, dependsOn });

const parkDomain = ({ id, name, nameEn, icon, summary, keywords, skill }) => Object.freeze({
  id,
  applicationId: "smart-park-platform",
  name,
  nameEn,
  icon,
  summary,
  keywords,
  skillPack: [`${skill}_analysis`, `${skill}_delivery`, `${skill}_validation`, `${skill}_reporting`],
  workflow: Object.freeze([
    stage("PLAN", `分析${name}目标与边界`, "code_development", "agent-5", null, `${skill}_analysis`),
    stage("BUILD", `完善${name}业务闭环`, "code_development", "agent-4", "PLAN", `${skill}_delivery`),
    stage("VALIDATE", `验证${name}权限、数据与状态`, "validation_testing", "agent-2", "BUILD", `${skill}_validation`),
    stage("REPORT", `生成${name}验收报告`, "document_generation", "agent-1", "VALIDATE", `${skill}_reporting`)
  ])
});

const growthDomain = ({ id, name, nameEn, icon, summary, keywords, skill, risk = "MEDIUM" }) => Object.freeze({
  id,
  applicationId: "ai-growth-sales-platform",
  name,
  nameEn,
  icon,
  summary,
  keywords,
  riskLevel: risk,
  skillPack: [`${skill}_strategy`, `${skill}_execution`, `${skill}_compliance`, `${skill}_optimization`],
  workflow: Object.freeze([
    stage("STRATEGY", `制定${name}策略与成功指标`, "document_generation", "agent-1", null, `${skill}_strategy`),
    stage("EXECUTE", `执行${name}受控流程`, "code_development", "agent-4", "STRATEGY", `${skill}_execution`),
    stage("GOVERN", `校验${name}授权、合规与质量`, "validation_testing", "agent-2", "EXECUTE", `${skill}_compliance`),
    stage("OPTIMIZE", `分析${name}结果并优化`, "spreadsheet_analysis", "agent-2", "GOVERN", `${skill}_optimization`)
  ])
});

const manufacturingDomain = ({ id, name, nameEn, icon, summary, keywords, skill, risk = "HIGH" }) => Object.freeze({
  id,
  applicationId: "intelligent-manufacturing-erp",
  name,
  nameEn,
  icon,
  summary,
  keywords,
  riskLevel: risk,
  skillPack: [`${skill}_planning`, `${skill}_operations`, `${skill}_control`, `${skill}_analytics`],
  workflow: Object.freeze([
    stage("PLAN", `规划${name}业务与主数据`, "document_generation", "agent-1", null, `${skill}_planning`),
    stage("OPERATE", `执行${name}业务闭环`, "code_development", "agent-4", "PLAN", `${skill}_operations`),
    stage("CONTROL", `校验${name}状态、权限与内控`, "validation_testing", "agent-2", "OPERATE", `${skill}_control`),
    stage("ANALYZE", `分析${name}效率、质量与成本`, "spreadsheet_analysis", "agent-2", "CONTROL", `${skill}_analytics`)
  ])
});

export const intelligentManufacturingDomains = Object.freeze([
  manufacturingDomain({ id: "manufacturing-master-data", name: "制造主数据", nameEn: "Manufacturing Master Data", icon: "MDM", summary: "统一物料、产品、单位、批次、工厂、车间、产线、工作中心和编码版本。", keywords: ["制造主数据", "物料主数据", "工厂主数据", "工作中心"], skill: "manufacturing_master_data" }),
  manufacturingDomain({ id: "product-engineering-bom", name: "产品工程与 BOM", nameEn: "Product Engineering & BOM", icon: "BOM", summary: "管理产品结构、设计 BOM、制造 BOM、替代料、版本、变更和生效控制。", keywords: ["bom", "物料清单", "产品结构", "制造bom", "工程变更"], skill: "product_engineering_bom" }),
  manufacturingDomain({ id: "process-routing-sop", name: "工艺路线与 SOP", nameEn: "Routing & SOP", icon: "SOP", summary: "管理工序、工艺路线、作业指导书、参数、工装、安全要求和版本签审。", keywords: ["sop", "工艺路线", "作业指导书", "工序", "工艺参数"], skill: "process_routing_sop" }),
  manufacturingDomain({ id: "manufacturing-sales-crm", name: "制造 CRM 与销售订单", nameEn: "Manufacturing CRM & Sales Orders", icon: "CRM", summary: "管理工业客户、询报价、样品、合同、销售订单、交期承诺和订单变更。", keywords: ["制造crm", "工业客户", "销售订单", "样品", "交期承诺"], skill: "manufacturing_sales_crm" }),
  manufacturingDomain({ id: "sales-operations-planning", name: "产销协同 S&OP", nameEn: "Sales & Operations Planning", icon: "SOPL", summary: "平衡需求预测、销售订单、产能、库存和供应约束，形成滚动产销计划。", keywords: ["s&op", "产销协同", "需求预测", "滚动计划"], skill: "sales_operations_planning" }),
  manufacturingDomain({ id: "mrp-procurement", name: "MRP 与采购", nameEn: "MRP & Procurement", icon: "MRP", summary: "根据需求、BOM、库存和提前期运行物料计划并驱动采购申请、订单和到货。", keywords: ["mrp", "物料需求计划", "采购申请", "采购订单"], skill: "mrp_procurement" }),
  manufacturingDomain({ id: "supplier-management", name: "供应商管理", nameEn: "Supplier Management", icon: "SRM", summary: "覆盖供应商准入、资质、询比价、绩效、质量、交付和风险协同。", keywords: ["供应商", "srm", "询比价", "供应商绩效"], skill: "supplier_management" }),
  manufacturingDomain({ id: "production-planning", name: "生产计划与排程", nameEn: "Production Planning & Scheduling", icon: "APS", summary: "形成主生产计划、生产订单、有限产能排程、齐套检查和派工。", keywords: ["生产计划", "生产排程", "aps", "生产订单", "齐套"], skill: "production_planning" }),
  manufacturingDomain({ id: "mes-shop-floor", name: "MES 车间执行", nameEn: "MES Shop-floor Execution", icon: "MES", summary: "管理派工、开工、报工、用料、产出、不良、停机、在制品和班组绩效。", keywords: ["mes", "车间执行", "报工", "派工", "在制品"], skill: "mes_shop_floor", risk: "CRITICAL" }),
  manufacturingDomain({ id: "quality-management", name: "质量管理 QMS", nameEn: "Quality Management", icon: "QMS", summary: "覆盖来料、过程、成品检验，不合格、偏差、CAPA、放行和质量追溯。", keywords: ["qms", "质量管理", "质量检验", "不合格", "capa"], skill: "quality_management", risk: "CRITICAL" }),
  manufacturingDomain({ id: "wms-logistics", name: "WMS 仓储物流", nameEn: "WMS & Logistics", icon: "WMS", summary: "管理收货、上架、库位、批次、序列号、拣配、发料、退料、盘点和发运。", keywords: ["wms", "仓储", "库位", "入库", "出库", "盘点", "发运"], skill: "wms_logistics", risk: "CRITICAL" }),
  manufacturingDomain({ id: "equipment-maintenance", name: "设备与维护", nameEn: "Equipment & Maintenance", icon: "EAM", summary: "管理设备台账、点检、保养、故障、维修、备件、OEE 和停机损失。", keywords: ["设备维护", "eam", "点检", "保养", "oee"], skill: "equipment_maintenance" }),
  manufacturingDomain({ id: "manufacturing-costing", name: "制造成本与财务接口", nameEn: "Manufacturing Costing", icon: "COST", summary: "核算材料、人工、制造费用、在制品、完工和差异，并向集团财务传递受控凭证。", keywords: ["制造成本", "生产成本", "成本核算", "在制品成本", "成本差异"], skill: "manufacturing_costing", risk: "CRITICAL" }),
  manufacturingDomain({ id: "manufacturing-traceability-cockpit", name: "追溯与经营驾驶舱", nameEn: "Traceability & Operations Cockpit", icon: "OPS", summary: "按订单、批次和序列号贯通供应、生产、质量、库存、交付、成本与经营指标。", keywords: ["生产追溯", "批次追溯", "制造驾驶舱", "生产经营"], skill: "manufacturing_traceability" })
]);

export const aiGrowthSalesDomains = Object.freeze([
  growthDomain({ id: "product-offer-center", name: "产品与营销资产", nameEn: "Product & Offer Center", icon: "OFR", summary: "接入不同产品、价格、权益、受众、品牌规范、事实证据和转化目标。", keywords: ["产品营销", "产品卖点", "产品文案", "offer", "营销资产"], skill: "product_offer" }),
  growthDomain({ id: "content-generation", name: "智能内容生产", nameEn: "AI Content Generation", icon: "COPY", summary: "生成并审核产品文案、图文、脚本、落地页素材和多语言版本。", keywords: ["自动生成文案", "产品文案", "营销文案", "内容生产", "copywriting"], skill: "content_generation" }),
  growthDomain({ id: "video-matrix", name: "视频与内容矩阵", nameEn: "Video & Content Matrix", icon: "VMX", summary: "将产品策略转为脚本、素材、成片、版本变体和渠道内容矩阵。", keywords: ["视频矩阵", "自动生成视频", "短视频矩阵", "内容矩阵"], skill: "video_matrix" }),
  growthDomain({ id: "channel-account-governance", name: "渠道与账号治理", nameEn: "Channel & Account Governance", icon: "CHN", summary: "管理平台账号申请、实名授权、凭据引用、角色权限、风控状态和账号健康；注册需人工批准。", keywords: ["平台注册", "账号注册", "渠道账号", "账号矩阵"], skill: "channel_account", risk: "HIGH" }),
  growthDomain({ id: "publishing-distribution", name: "智能发布与分发", nameEn: "Publishing & Distribution", icon: "PUB", summary: "按平台规则完成排期、审批、发布、失败恢复、链接追踪和矩阵效果归因。", keywords: ["自动发布", "内容发布", "矩阵发布", "渠道分发"], skill: "publishing_distribution", risk: "HIGH" }),
  growthDomain({ id: "lead-intelligence", name: "线索获取与客户洞察", nameEn: "Lead Intelligence", icon: "LEAD", summary: "从合法授权渠道采集线索、去重、补全、评分、分群并记录来源与同意状态。", keywords: ["获取客户信息", "客户线索", "获客", "线索评分", "客户洞察"], skill: "lead_intelligence", risk: "HIGH" }),
  growthDomain({ id: "customer-engagement", name: "客户触达与智能应答", nameEn: "Customer Engagement", icon: "ENG", summary: "在客户同意、频控和渠道规则内完成触达、会话接待、需求识别、答复和人工升级。", keywords: ["联系客户", "自动加客户", "答复客户", "智能应答", "客户触达"], skill: "customer_engagement", risk: "CRITICAL" }),
  growthDomain({ id: "sales-conversion", name: "销售机会与转化", nameEn: "Sales Conversion", icon: "CRM", summary: "管理客户、商机、跟进、方案、报价、审批、预测和成交转化。", keywords: ["销售转化", "销售机会", "商机", "报价", "成交"], skill: "sales_conversion", risk: "HIGH" }),
  growthDomain({ id: "transaction-handoff", name: "交易系统交接", nameEn: "Transaction Handoff", icon: "ORD", summary: "将已确认的客户、商品、价格和交易意向幂等交接到外部订单、合同、支付或 ERP。", keywords: ["转入交易系统", "成交后", "订单交接", "合同交接", "支付交接"], skill: "transaction_handoff", risk: "CRITICAL" }),
  growthDomain({ id: "customer-success-service", name: "售后与客户成功", nameEn: "Customer Success & Service", icon: "CS", summary: "提供机器人客服、知识答复、工单、退换售后、续费增购、满意度和人工接管。", keywords: ["售后机器人", "机器人客服", "自动售后", "客户成功", "售后服务"], skill: "customer_success", risk: "HIGH" })
]);

export const smartParkBusinessDomains = Object.freeze([
  parkDomain({ id: "park-cockpit", name: "园区经营驾驶舱", nameEn: "Park Operations Cockpit", icon: "OPS", summary: "汇总园区资产、招商、服务、安全、工程和智能运营指标，并向集团战略平台提供业务板块指标。", keywords: ["园区驾驶舱", "园区经营", "经营总览", "park cockpit"], skill: "park_cockpit" }),
  parkDomain({ id: "asset-space", name: "资产与空间", nameEn: "Assets & Space", icon: "AST", summary: "管理园区、楼栋、楼层、房源、企业入驻与空间关系。", keywords: ["园区资产", "空间", "房源", "楼栋", "楼层", "asset"], skill: "asset_space" }),
  parkDomain({ id: "investment-leasing", name: "招商与租赁", nameEn: "Investment & Leasing", icon: "CRM", summary: "贯通招商线索、公海、漏斗、合同、变更、退租和园区结算来源。", keywords: ["招商", "租赁", "合同", "线索", "退租", "leasing"], skill: "investment_leasing" }),
  parkDomain({ id: "park-settlement-billing", name: "园区结算", nameEn: "Park Settlement & Billing", icon: "BILL", summary: "管理租赁与服务应收、收款、核销、发票、减免、退款和对账，并向集团财务发送受控凭证。", keywords: ["园区结算", "园区应收", "租赁收款", "园区发票", "park billing"], skill: "park_settlement" }),
  parkDomain({ id: "tenant-service-workflow", name: "企业服务与工单", nameEn: "Tenant Service & Workflows", icon: "SVC", summary: "贯通企业服务、流程收件箱、工单、SLA、评价和跨域协同。", keywords: ["企业服务", "租户服务", "工单", "sla", "workflow"], skill: "tenant_service" }),
  parkDomain({ id: "safety-management", name: "园区安全", nameEn: "Park Safety", icon: "SAFE", summary: "覆盖巡检、隐患、应急事件、作业许可与整改闭环。", keywords: ["园区安全", "巡检", "隐患", "应急", "作业许可"], skill: "park_safety" }),
  parkDomain({ id: "engineering-management", name: "工程管理", nameEn: "Engineering Management", icon: "ENG", summary: "管理园区工程项目、计划、日报、巡检、整改和验收。", keywords: ["工程", "施工", "工程计划", "工程验收"], skill: "engineering" }),
  parkDomain({ id: "iot-platform", name: "园区 IoT", nameEn: "Park IoT", icon: "IoT", summary: "管理网关、设备、协议、指标、告警、规则与场景联动。", keywords: ["iot", "设备", "网关", "场景联动", "设备告警"], skill: "park_iot" }),
  parkDomain({ id: "energy-management", name: "能耗管理", nameEn: "Energy Management", icon: "NRG", summary: "完成园区能源计量、分摊、账单和红冲，并将结算事实交给园区结算域。", keywords: ["能耗", "电表", "能源", "energy"], skill: "energy_management" }),
  parkDomain({ id: "video-security", name: "视频安防", nameEn: "Video Security", icon: "VID", summary: "管理视频平台、摄像头、告警、截图与安全事件证据。", keywords: ["视频安防", "摄像头", "视频告警", "监控"], skill: "video_security" }),
  parkDomain({ id: "robot-operations", name: "机器人运营", nameEn: "Robot Operations", icon: "BOT", summary: "管理机器人接入、任务、状态、轨迹、异常与工单联动。", keywords: ["机器人", "清洁机器人", "巡检机器人", "robot"], skill: "robot_operations" }),
  parkDomain({ id: "digital-twin", name: "BIM 数字孪生", nameEn: "BIM Digital Twin", icon: "BIM", summary: "将园区空间、设备、能耗、视频、机器人和事件映射到统一空间界面。", keywords: ["bim", "数字孪生", "三维", "空间模型"], skill: "digital_twin" }),
  parkDomain({ id: "ai-park-operations", name: "AI 园区运营", nameEn: "AI Park Operations", icon: "AI", summary: "在园区授权数据范围内提供查询、分析、建议和受控运营动作。", keywords: ["ai园区", "园区助手", "运营助手", "ai park"], skill: "ai_park_operations" })
]);

/**
 * Product applications are navigation and ownership boundaries. They are not
 * Agent lanes and do not own a second scheduler, worker pool, or data model.
 */
export const studioApplications = Object.freeze([
  {
    id: "engineering-cad-center",
    name: "工程 CAD 中心",
    nameEn: "Engineering CAD Center",
    icon: "CAD",
    summary: "AI 原生工程图纸读取、解析、几何分析、预览与统计中心；不承担 CAD 编辑器职责。",
    evidence: "CAD_001_IMPLEMENTED",
    domainIds: ["engineering-cad"]
  },
  {
    id: "software-factory",
    name: "软件工厂",
    nameEn: "Software Factory",
    icon: "DEV",
    summary: "面向软件规划、开发、验证和交付的自主研发应用。",
    evidence: "USER_RECORDED",
    domainIds: ["software-engineering"]
  },
  {
    id: "video-factory",
    name: "视频工厂",
    nameEn: "Video Factory",
    icon: "VID",
    summary: "面向素材分析、脚本、视觉制作、渲染和发布的媒体生产应用。",
    evidence: "USER_RECORDED",
    domainIds: ["video-production"]
  },
  {
    id: "enterprise-strategy-platform",
    name: "集团战略执行平台",
    nameEn: "Enterprise Strategy Platform",
    icon: "STR",
    summary: "集团战略地图、目标、指标、重点任务、责任分解和复盘的独立业务平台。",
    evidence: "USER_CONFIRMED",
    domainIds: ["strategy-execution"]
  },
  {
    id: "human-resources-platform",
    name: "集团人力资源平台",
    nameEn: "Enterprise HR Platform",
    icon: "HR",
    summary: "集团组织、岗位、员工、招聘、绩效和人才发展的独立业务平台。",
    evidence: "USER_CONFIRMED",
    domainIds: ["human-resources"]
  },
  {
    id: "finance-platform",
    name: "集团财务平台",
    nameEn: "Enterprise Finance Platform",
    icon: "FIN",
    summary: "集团预算、核算、资金、税务、应收应付和经营分析的独立业务平台。",
    evidence: "USER_CONFIRMED",
    domainIds: ["finance-management"]
  },
  {
    id: "ai-growth-sales-platform",
    name: "AI 增长与销售平台",
    nameEn: "AI Growth & Sales Platform",
    icon: "GROW",
    summary: "面向多产品的智能获客、内容矩阵、客户触达、销售转化、交易交接和售后服务平台。",
    evidence: "USER_CONFIRMED",
    domainIds: aiGrowthSalesDomains.map((domain) => domain.id)
  },
  {
    id: "intelligent-manufacturing-erp",
    name: "智能制造 ERP 平台",
    nameEn: "Intelligent Manufacturing ERP",
    icon: "MFG",
    summary: "面向自有生产企业，贯通产品工程、计划、采购、生产、质量、仓储、销售订单、成本和追溯。",
    evidence: "USER_CONFIRMED",
    domainIds: intelligentManufacturingDomains.map((domain) => domain.id)
  },
  {
    id: "smart-park-platform",
    name: "智慧园区业务平台",
    nameEn: "Smart Park Business Platform",
    icon: "ERP",
    summary: "集团旗下智慧园区业务板块，承载园区资产、招商、服务、安全、工程与智能运营。",
    evidence: "USER_CONFIRMED",
    domainIds: smartParkBusinessDomains.map((domain) => domain.id)
  }
]);

/**
 * Business domains define professional workflows and skill requirements only.
 * Agent and Worker assignments are resolved later from the runtime registries.
 */
export const studioDomains = Object.freeze([
  {
    id: "engineering-cad",
    applicationId: "engineering-cad-center",
    name: "工程 CAD 分析",
    nameEn: "Engineering CAD Analysis",
    icon: "CAD",
    summary: "将工程图纸转为统一 CAD JSON，提供只读几何、图层、实体、标注、面积、长度、统计与预览。",
    skillPack: ["cad_document_load", "cad_dxf_parse", "cad_geometry_analysis", "cad_preview", "cad_statistics"],
    keywords: ["cad", "dxf", "dwg", "ifc", "工程图", "图纸", "几何", "面积", "长度"],
    workflow: Object.freeze([
      stage("LOAD", "安全加载并识别工程图纸", "cad_document_load", "agent-engineering-cad"),
      stage("PARSE", "解析图层、实体、块、文字和标注", "cad_dxf_parse", "agent-engineering-cad", "LOAD"),
      stage("ANALYZE", "计算几何、面积、长度和统计", "cad_geometry_analysis", "agent-engineering-cad", "PARSE"),
      stage("PREVIEW", "生成安全的只读图纸预览", "cad_preview", "agent-engineering-cad", "ANALYZE")
    ])
  },
  {
    id: "software-engineering",
    applicationId: "software-factory",
    name: "软件研发",
    nameEn: "Software Engineering",
    icon: "CODE",
    summary: "将产品目标转化为设计、代码、测试和可审计交付结果。",
    skillPack: ["solution_planning", "software_delivery", "quality_validation", "delivery_reporting"],
    keywords: ["软件", "开发", "代码", "页面", "接口", "修复", "测试", "software", "code", "api"],
    workflow: Object.freeze([
      stage("PLAN", "分析需求与技术边界", "code_development", "agent-5", null, "solution_planning"),
      stage("BUILD", "实现软件变更", "code_development", "agent-4", "PLAN", "software_delivery"),
      stage("VALIDATE", "运行测试与安全校验", "validation_testing", "agent-2", "BUILD", "quality_validation"),
      stage("REPORT", "生成交付报告", "document_generation", "agent-1", "VALIDATE", "delivery_reporting")
    ])
  },
  {
    id: "video-production",
    applicationId: "video-factory",
    name: "视频生产",
    nameEn: "Video Production",
    icon: "MEDIA",
    summary: "编排脚本、视觉素材、受控生成、剪辑、媒体验收和交付；专业 Runner 必须通过实时能力门禁。",
    skillPack: ["media_briefing", "script_storyboard", "video_generation", "media_validation", "media_delivery_reporting"],
    keywords: ["视频", "素材", "剪辑", "配音", "字幕", "封面", "video", "media", "subtitle"],
    workflow: Object.freeze([
      stage("PLAN", "分析素材与成片目标", "document_generation", "agent-1", null, "media_briefing"),
      stage("SCRIPT", "生成脚本与镜头表", "document_generation", "agent-1", "PLAN", "script_storyboard"),
      stage("GENERATE", "生成可审计视频构图与成片", "video_generation", "agent-media-generator", "SCRIPT", "video_generation"),
      stage("VALIDATE", "验证编码、尺寸、时长、音轨和文件完整性", "media_validation", "agent-media-qa", "GENERATE", "media_validation"),
      stage("REPORT", "生成媒体交付报告", "document_generation", "agent-1", "VALIDATE", "media_delivery_reporting")
    ])
  },
  {
    id: "strategy-execution",
    applicationId: "enterprise-strategy-platform",
    name: "战略执行",
    nameEn: "Strategy Execution",
    icon: "STR",
    summary: "从战略目标到年度重点、指标、责任与执行复盘的管理闭环。",
    skillPack: ["strategic_goal_design", "strategy_kpi_modeling", "initiative_cascade", "strategy_review"],
    keywords: ["战略", "年度目标", "经营目标", "okr", "kpi", "执行复盘", "strategy"],
    workflow: Object.freeze([
      stage("PLAN", "澄清战略目标与约束", "document_generation", "agent-1", null, "strategic_goal_design"),
      stage("METRICS", "建立指标与目标值", "spreadsheet_analysis", "agent-2", "PLAN", "strategy_kpi_modeling"),
      stage("CASCADE", "拆解责任与行动计划", "document_generation", "agent-1", "METRICS", "initiative_cascade"),
      stage("REPORT", "生成战略执行报告", "document_generation", "agent-1", "CASCADE", "strategy_review")
    ])
  },
  {
    id: "human-resources",
    applicationId: "human-resources-platform",
    name: "人力资源",
    nameEn: "Human Resources",
    icon: "HR",
    summary: "围绕组织、岗位、人才、绩效与员工服务形成可持续工作流。",
    skillPack: ["workforce_goal_analysis", "organization_design", "hr_policy_validation", "people_operations_reporting"],
    keywords: ["人力", "组织", "岗位", "招聘", "员工", "绩效", "薪酬", "人才", "hr"],
    workflow: Object.freeze([
      stage("PLAN", "识别人力资源目标与合规边界", "document_generation", "agent-1", null, "workforce_goal_analysis"),
      stage("DESIGN", "设计组织与人才流程", "document_generation", "agent-1", "PLAN", "organization_design"),
      stage("VALIDATE", "校验规则、权限与结果", "validation_testing", "agent-2", "DESIGN", "hr_policy_validation"),
      stage("REPORT", "生成人力资源执行报告", "document_generation", "agent-1", "VALIDATE", "people_operations_reporting")
    ])
  },
  {
    id: "finance-management",
    applicationId: "finance-platform",
    name: "财务管理",
    nameEn: "Finance Management",
    icon: "FIN",
    summary: "覆盖预算、核算、资金、应收应付、经营分析与财务风控。",
    skillPack: ["finance_scope_control", "budget_accounting_model", "financial_control_validation", "management_reporting"],
    keywords: ["财务", "预算", "核算", "资金", "应收", "应付", "发票", "报销", "经营分析", "finance"],
    workflow: Object.freeze([
      stage("PLAN", "确认财务目标与数据边界", "document_generation", "agent-1", null, "finance_scope_control"),
      stage("MODEL", "建立财务分析与核算模型", "spreadsheet_analysis", "agent-2", "PLAN", "budget_accounting_model"),
      stage("VALIDATE", "执行财务校验与风控检查", "validation_testing", "agent-2", "MODEL", "financial_control_validation"),
      stage("REPORT", "生成财务管理报告", "document_generation", "agent-1", "VALIDATE", "management_reporting")
    ])
  },
  ...smartParkBusinessDomains,
  ...aiGrowthSalesDomains,
  ...intelligentManufacturingDomains
]);

const normalize = (value) => String(value ?? "").toLowerCase();
const matches = (text, keywords) => (keywords ?? []).filter((keyword) => normalize(text).includes(normalize(keyword)));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

export function getStudioApplication(id) {
  return studioApplications.find((application) => application.id === id) ?? null;
}

export function getStudioDomain(id) {
  return studioDomains.find((domain) => domain.id === id) ?? null;
}

export function routeStudioDomain(goal, { explicitDomainId = null } = {}) {
  if (explicitDomainId) {
    const explicit = getStudioDomain(explicitDomainId);
    if (!explicit) throw Object.assign(new Error("DOMAIN_NOT_FOUND"), { code: "DOMAIN_NOT_FOUND" });
    return { applicationId: explicit.applicationId, domainId: explicit.id, confidence: 1, source: "EXPLICIT", alternatives: [] };
  }
  const scored = studioDomains
    .map((domain) => ({ applicationId: domain.applicationId, domainId: domain.id, score: matches(goal, domain.keywords).length }))
    .sort((a, b) => b.score - a.score || a.domainId.localeCompare(b.domainId));
  if (scored[0].score === 0) {
    return { applicationId: "software-factory", domainId: "software-engineering", confidence: 0.35, source: "FALLBACK", alternatives: [] };
  }
  const best = scored[0];
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  return {
    applicationId: best.applicationId,
    domainId: best.domainId,
    confidence: Number(Math.min(0.98, 0.55 + best.score / Math.max(total, 1) * 0.4).toFixed(2)),
    source: "KEYWORD",
    alternatives: scored.slice(1, 4).filter((item) => item.score > 0)
  };
}

export async function loadDomainRuntimeRegistry() {
  const professionalRegistry = new ProfessionalRunnerCapabilityRegistry({ credentialReferenceIds: String(process.env.STUDIO_PROFESSIONAL_CREDENTIAL_REFERENCES ?? "").split(",").map(value => value.trim()).filter(Boolean), registeredAdapterIds:implementedProfessionalAdapterIds });
  const [skillRegistry, skillRules, agentRegistry, workerRegistry, professionalCapabilities] = await Promise.all([
    readJson(paths.skills), readJson(paths.skillRules), readJson(paths.agents), readJson(paths.workers), professionalRegistry.inventory()
  ]);
  const profileStatus = new Map(professionalCapabilities.profiles.map(profile => [profile.profile_id, profile.readiness]));
  workerRegistry.workers = workerRegistry.workers.map(worker => worker.professional_profile_id ? { ...worker, status: profileStatus.get(worker.professional_profile_id) === "READY" ? "available" : "unavailable" } : worker);
  return { skillRegistry, skillRules, agentRegistry, workerRegistry, professionalCapabilities, paths };
}

export function routeSkill(text, registry) {
  const skills = new Map((registry.skillRegistry.skills ?? []).map((skill) => [skill.skill_type, skill]));
  const scored = (registry.skillRules.rules ?? [])
    .map((rule) => {
      const keywords = matches(text, rule.keywords);
      return { rule, skill: skills.get(rule.skill_type), keywords, score: keywords.length * 10 + (keywords.length ? Number(rule.confidence_boost ?? 0) : 0) };
    })
    .filter((item) => item.skill)
    .sort((a, b) => b.score - a.score || String(a.rule.rule_id).localeCompare(String(b.rule.rule_id)));
  const selected = scored.find((item) => item.score > 0);
  const fallbackType = registry.skillRules.routing_policy?.fallback_skill_type ?? "code_development";
  const fallback = skills.get(fallbackType);
  const final = selected ?? { rule: { skill_type: fallbackType, selected_agent: "agent-5", runtime: "codex-cli" }, skill: fallback, keywords: [], score: 0 };
  return {
    skillType: final.rule.skill_type,
    skillId: final.skill?.skill_id ?? final.rule.skill_type,
    agentId: final.rule.selected_agent ?? final.skill?.default_agent ?? "agent-5",
    runtimeId: final.rule.runtime ?? final.skill?.default_runtime ?? "codex-cli",
    riskLevel: final.skill?.risk_level ?? "MEDIUM",
    validationCommands: final.skill?.validation_commands ?? [],
    confidence: selected ? Math.min(0.95, 0.55 + final.score / 100) : 0.35,
    matchedKeywords: final.keywords
  };
}

function agentForSkill(registry, preferredAgentId, skillType) {
  const agents = registry.agentRegistry.agents ?? [];
  const preferred = agents.find((agent) => agent.agent_id === preferredAgentId && agent.status === "ACTIVE" && (agent.supported_skills ?? []).includes(skillType));
  return preferred ?? agents
    .filter((agent) => agent.status === "ACTIVE" && (agent.supported_skills ?? []).includes(skillType))
    .sort((a, b) => Number(a.priority ?? 99) - Number(b.priority ?? 99))[0] ?? null;
}

function workerForSkill(registry, skillType, runtimeId = null) {
  const available = (registry.workerRegistry.workers ?? []).filter((worker) => worker.status === "available" && (worker.supported_skills ?? []).includes(skillType));
  return available.find((worker) => !runtimeId || worker.runtime_id === runtimeId) ?? available[0] ?? null;
}

export function resolveDomainCapability(domain, registry) {
  const uniqueSkills = [...new Set(domain.workflow.map((item) => item.skillType))];
  const skills = uniqueSkills.map((skillType) => {
    const worker = workerForSkill(registry, skillType);
    const agents = (registry.agentRegistry.agents ?? []).filter((agent) => agent.status === "ACTIVE" && (agent.supported_skills ?? []).includes(skillType));
    return { skillType, ready: Boolean(worker && agents.length), workerKey: worker?.worker_id ?? null, runtimeId: worker?.runtime_id ?? null, agentIds: agents.map((agent) => agent.agent_id) };
  });
  const stages = domain.workflow.map((workflowStage) => {
    const capability = skills.find((item) => item.skillType === workflowStage.skillType);
    return { key: workflowStage.key, title: workflowStage.title, businessSkillId: workflowStage.businessSkillId, ...capability };
  });
  return { status: skills.every((item) => item.ready) ? "READY" : "BLOCKED", skills, stages, blockedReasons: skills.filter((item) => !item.ready).map((item) => `NO_ONLINE_CAPACITY:${item.skillType}`) };
}

export function compileDomainWorkflow(goal, registry, { explicitDomainId = null, goalId = "domain-goal", businessTaskBinding = null } = {}) {
  const domainRoute = routeStudioDomain(goal, { explicitDomainId });
  const domain = getStudioDomain(domainRoute.domainId);
  const application = getStudioApplication(domain.applicationId);
  const primarySkill = routeSkill(goal, registry);
  const assignments = domain.workflow.map((workflowStage) => {
    const agent = agentForSkill(registry, workflowStage.preferredAgentId, workflowStage.skillType);
    const skill = (registry.skillRegistry.skills ?? []).find((item) => item.skill_type === workflowStage.skillType);
    const worker = workerForSkill(registry, workflowStage.skillType, skill?.default_runtime ?? null);
    return {
      ...workflowStage,
      agentId: agent?.agent_id ?? null,
      preferredRuntimeId: skill?.default_runtime ?? null,
      runtimeId: worker?.runtime_id ?? skill?.default_runtime ?? null,
      workerKey: worker?.worker_id ?? null,
      workerMode: worker?.process_probe?.on_demand_ok ? "ON_DEMAND" : worker ? "REGISTERED" : "MISSING",
      status: agent && worker ? "READY" : "BLOCKED",
      blockedReasons: [...(!agent ? [`NO_AGENT_FOR_SKILL:${workflowStage.skillType}`] : []), ...(!worker ? [`NO_WORKER_FOR_SKILL:${workflowStage.skillType}`] : [])]
    };
  });
  const taskPrefix = goalId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const tasks = assignments.map((assignment) => ({
    taskKey: `${taskPrefix}_${assignment.key}`,
    title: assignment.title,
    description: `${assignment.title}: ${goal}`,
    priority: assignment.key === "BUILD" || assignment.key === "MODEL" ? "P1" : "P2",
    riskLevel: assignment.skillType === primarySkill.skillType ? primarySkill.riskLevel : "LOW",
    requiredCapabilities: [assignment.skillType],
    maxAttempts: 1,
    metadata: {
      applicationId: application.id,
      domainId: domain.id,
      workflowStage: assignment.key,
      businessSkillId: assignment.businessSkillId,
      skillType: assignment.skillType,
      agentId: assignment.agentId,
      preferredRuntimeId: assignment.preferredRuntimeId,
      runtimeId: assignment.runtimeId,
      workerKey: assignment.workerKey,
      workerMode: assignment.workerMode,
      assignmentStatus: assignment.status,
      blockedReasons: assignment.blockedReasons,
      businessTaskBinding: businessTaskBinding ? { ...businessTaskBinding, workflow: { ...businessTaskBinding.workflow, stageId: assignment.key } } : null
    }
  }));
  const dependencies = assignments.filter((assignment) => assignment.dependsOn).map((assignment) => ({
    taskKey: `${taskPrefix}_${assignment.key}`,
    dependsOnTaskKey: `${taskPrefix}_${assignment.dependsOn}`,
    dependencyType: "SUCCESS_REQUIRED",
    requiredStatus: "SUCCEEDED"
  }));
  return {
    schemaVersion: 2,
    goalId,
    goal,
    domainRoute,
    application: { id: application.id, name: application.name },
    domain: { id: domain.id, name: domain.name, applicationId: domain.applicationId },
    primarySkill,
    assignments,
    tasks,
    dependencies,
    status: assignments.every((item) => item.status === "READY") ? "READY" : "BLOCKED",
    blockedReasons: assignments.flatMap((item) => item.blockedReasons),
    longRunning: true,
    persistentKernelRequired: true,
    onlineRunnerRequired: true
  };
}

export class DomainWorkflowService {
  constructor({ kernel, registry }) {
    if (!kernel?.submitPlan) throw Object.assign(new Error("KERNEL_REQUIRED"), { code: "KERNEL_REQUIRED" });
    this.kernel = kernel;
    this.registry = registry;
  }
  compile(goal, options) { return compileDomainWorkflow(goal, this.registry, options); }
  async compileAndSubmit(goal, options) {
    const workflow = this.compile(goal, options);
    if (workflow.status !== "READY") throw Object.assign(new Error(`WORKFLOW_BLOCKED:${workflow.blockedReasons.join(",")}`), { code: "WORKFLOW_BLOCKED", workflow });
    const submission = await this.kernel.submitPlan(workflow.goalId, {
      plannerVersion: `business-domain-workflow-v2-${workflow.domain.id}`,
      sourceArtifactRef: `application:${workflow.application.id}/domain:${workflow.domain.id}`,
      tasks: workflow.tasks,
      dependencies: workflow.dependencies
    });
    return { workflow, submission };
  }
}

export function domainCenterSummary() {
  return {
    schemaVersion: 3,
    applicationCount: studioApplications.length,
    domainCount: studioDomains.length,
    singleControlPlane: true,
    sourceOfTruth: "business-application-registry",
    professionalSkillRunners: professionalBusinessSkillContracts,
    applications: studioApplications.map((application) => ({
      ...application,
      domains: application.domainIds.map((domainId) => getStudioDomain(domainId))
    })),
    domains: studioDomains
  };
}
