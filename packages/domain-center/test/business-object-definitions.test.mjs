import test from "node:test";
import assert from "node:assert/strict";
import { availableBusinessTransitions, businessWorkflowGoal, getBusinessObjectDefinition, validateBusinessObjectFields } from "../lib/business-object-definitions.mjs";
import { enterpriseApplications } from "../lib/enterprise-applications.mjs";
import { getStudioApplication, getStudioDomain } from "../lib/domain-center.mjs";

test("strategy, HR and finance have domain-specific schemas and review states", () => {
  const strategy = getBusinessObjectDefinition("enterprise-strategy-platform", "objective");
  const hr = getBusinessObjectDefinition("human-resources-platform", "recruitment_case");
  const finance = getBusinessObjectDefinition("finance-platform", "expense");
  assert.equal(strategy.agentReviewStatus, "WAITING_REVIEW");
  assert.equal(hr.agentReviewStatus, "WAITING_APPROVAL");
  assert.equal(finance.agentReviewStatus, "WAITING_APPROVAL");
  assert.deepEqual(availableBusinessTransitions("finance-platform", "expense", "UNDER_REVIEW"), ["WAITING_APPROVAL", "REJECTED", "BLOCKED"]);
  assert.match(businessWorkflowGoal("finance-platform", { objectType: "expense", title: "EXP-001" }), /预算科目/);
});

test("business field validation normalizes numbers and rejects invalid values", () => {
  const fields = validateBusinessObjectFields("finance-platform", "expense", { expenseDate: "2026-07-20", department: "财务中心", category: "差旅", amount: "88.50", currency: "CNY", budgetCode: "TRAVEL", description: "出差" });
  assert.equal(fields.amount, 88.5);
  assert.throws(() => validateBusinessObjectFields("finance-platform", "expense", { expenseDate: "2026-07-20" }), (error) => error.code === "BUSINESS_FIELD_REQUIRED");
});

test("channel accounts accept Credential Reference IDs and reject secret-like values before persistence",()=>{const base={platform:"视频号",accountRef:"ACCOUNT-001",ownerOrganization:"金湖集团",authorizationExpiresAt:"2026-12-31",publishingScope:"已审批产品内容"};assert.equal(validateBusinessObjectFields("ai-growth-sales-platform","channel_account",{...base,credentialReferenceId:"video-channel-ref"}).credentialReferenceId,"video-channel-ref");for(const credentialReferenceId of ["sk-secret-value","Bearer abcdef","token=abcdef","eyJabc.def.ghi"]){assert.throws(()=>validateBusinessObjectFields("ai-growth-sales-platform","channel_account",{...base,credentialReferenceId}),error=>error.code==="BUSINESS_CREDENTIAL_REFERENCE_INVALID");}});

test("every registered business object routes to a domain owned by its application", () => {
  for (const application of enterpriseApplications.filter((item) => !["software-factory", "video-factory"].includes(item.id))) {
    for (const objectType of application.objectTypes) {
      const schema = getBusinessObjectDefinition(application.id, objectType.id);
      assert.ok(schema.workflowDomainId, `${application.id}.${objectType.id} must declare workflowDomainId`);
      assert.equal(getStudioDomain(schema.workflowDomainId)?.applicationId, application.id);
      assert.ok(schema.fields.some((field) => field.required), `${application.id}.${objectType.id} must have required domain fields`);
    }
  }
});

test("operational applications route distinct objects to distinct skill domains", () => {
  assert.equal(getBusinessObjectDefinition("ai-growth-sales-platform", "lead").workflowDomainId, "lead-intelligence");
  assert.equal(getBusinessObjectDefinition("ai-growth-sales-platform", "opportunity").workflowDomainId, "sales-conversion");
  assert.equal(getBusinessObjectDefinition("intelligent-manufacturing-erp", "bom").workflowDomainId, "product-engineering-bom");
  assert.equal(getBusinessObjectDefinition("intelligent-manufacturing-erp", "quality_case").workflowDomainId, "quality-management");
  assert.equal(getBusinessObjectDefinition("smart-park-platform", "service_order").workflowDomainId, "tenant-service-workflow");
  assert.equal(getBusinessObjectDefinition("smart-park-platform", "meter").workflowDomainId, "energy-management");
});

test("Smart Park has a conventional business object for every intelligent workflow domain",()=>{const application=enterpriseApplications.find(item=>item.id==="smart-park-platform"),covered=new Set(application.objectTypes.map(item=>getBusinessObjectDefinition(application.id,item.id).workflowDomainId));assert.deepEqual([...getStudioApplication(application.id).domainIds].filter(domainId=>!covered.has(domainId)),[]);assert.equal(application.objectTypes.length,14);assert.equal(getBusinessObjectDefinition(application.id,"iot_device").fields.find(item=>item.key==="credentialReferenceId").referenceOnly,true);});
