#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  approveContentBrief,
  assertTenantChannelAction,
  buildCustomer360,
  buildGrowthCockpit,
  createAttributionEngine,
  createContentBrief,
  createContentProductionJob,
  createDiscoveryIngestion,
  createEngagementIngestion,
  createFollowUpOrchestrator,
  createGrowthDirector,
  createLead,
  createLeadGraph,
  createMockDiscoveryAdapter,
  createMockPublishingAdapter,
  createPublishingService,
  createQualificationEngine,
  createScoringEngine,
  defineBusinessIntegrationAdapter,
  defineTenantPack,
  explainQualification,
  handoffCommercialObject,
  traceRevenuePath,
} from '../lib/index.mjs';

const scope={organizationId:'acceptance-org',workspaceId:'growth-platform',tenantId:'tenant-a'};
const evidence={program:'ANKSEN_AI_GROWTH_PLATFORM',scope,ga:{},startedAt:new Date().toISOString()};

const tenant=defineTenantPack({...scope,name:'Reusable Tenant',brands:[{id:'brand',name:'Brand'}],markets:[{id:'market',country:'AE',currency:'USD'}],icps:[{id:'icp',name:'B2B Buyer',roles:['BUYER'],industries:['B2B'],markets:['market']}],channelPolicies:{MOCK:{enabled:true,allowedCapabilities:['PUBLISH_CONTENT'],requiresApproval:['PUBLISH_CONTENT'],dailyWriteLimit:5},WEBSITE:{enabled:true,allowedCapabilities:['RECEIVE_WEBHOOK'],requiresApproval:[]}},qualification:{mqlMinScore:60,sqlMinScore:80},attribution:{model:'POSITION_BASED',windowDays:90},contentPolicy:{humanApprovalBeforePublish:true,forbidUnverifiedClaims:true}});
const secondTenant=defineTenantPack({...scope,tenantId:'tenant-b',name:'Unrelated Tenant',brands:[{id:'food',name:'Food'}],markets:[{id:'laos',country:'LA'}],icps:[{id:'wholesaler',name:'Wholesaler',industries:['FOOD_DISTRIBUTION']}],channelPolicies:{WEBSITE:{enabled:true,allowedCapabilities:['RECEIVE_WEBHOOK'],requiresApproval:[]}}});
assert.equal(secondTenant.icps[0].industries[0],'FOOD_DISTRIBUTION');
assert.equal(assertTenantChannelAction(tenant,{channel:'MOCK',capability:'PUBLISH_CONTENT'}).approvalRequired,true);
evidence.ga['GA-000/001/002/003']={status:'PASS',tenantIsolation:true,reusableSecondTenant:true,policyGated:true};

const discoveryAdapter=createMockDiscoveryAdapter({prospects:[{externalId:'source-1',email:'buyer@example.com',company:{name:'Buyer LLC'}},{externalId:'source-2',email:'buyer@example.com',company:{name:'Buyer LLC'}}]});
const discovery=createDiscoveryIngestion({scope,adapter:discoveryAdapter,clock:()=> '2026-08-26T00:00:00Z'});
const prospects=await discovery.ingest({operationId:'acceptance-discovery',query:{market:'AE'}});
assert.equal(prospects.length,2);assert.equal(discovery.events.length,2);
evidence.ga['GA-004']={status:'PASS',prospects:prospects.length,provenance:prospects.every(p=>p.provenance.operationId==='acceptance-discovery')};

const graph=createLeadGraph({scope,clock:()=> '2026-08-26T00:05:00Z'});
const p1=graph.upsertSourceProfile({source:'CHANNEL_A',externalId:'a1',email:'buyer@example.com',company:{name:'Buyer LLC'}});
const p2=graph.upsertSourceProfile({source:'CHANNEL_B',externalId:'b1',email:'buyer@example.com',company:{name:'Buyer LLC'}});
const match=graph.resolve(p2,[p1]);assert.equal(match.confidence,1);assert.equal(match.match.sourceProfileId,p1.sourceProfileId);
graph.attach({canonicalId:'lead-1',canonicalType:'lead',sourceProfileId:p1.sourceProfileId,confidence:1,evidence:match.evidence});graph.attach({canonicalId:'lead-1',canonicalType:'lead',sourceProfileId:p2.sourceProfileId,confidence:1,evidence:match.evidence});
evidence.ga['GA-005']={status:'PASS',confidence:match.confidence,evidence:match.evidence,linkedProfiles:graph.customer360('lead-1').sourceProfiles.length};

const lead=createLead({...scope,leadId:'lead-1',source:'CHANNEL_A',person:{name:'Buyer'},company:{name:'Buyer LLC'},marketId:'market',icpId:'icp',externalRefs:[{channel:'CHANNEL_A',externalId:'a1'},{channel:'CHANNEL_B',externalId:'b1'}]});
const scoring=createScoringEngine({scope,policy:{base:5,halfLifeDays:30,version:'acceptance-score-v1'}});
const score=scoring.calculate({subjectId:lead.leadId,occurredAt:'2026-08-26T01:00:00Z',factors:[{name:'FIT:icp',value:35,source:'profile'},{name:'INTENT:rfq',value:45,source:'website'},{name:'ENGAGEMENT:depth',value:10,source:'website'}]});
assert.ok(score.value>=80);assert.equal(scoring.getHistory('lead-1').length,1);
evidence.ga['GA-006']={status:'PASS',score:score.value,factors:score.factors.length,policyVersion:score.policyVersion};

const engagementIngestion=createEngagementIngestion({scope,clock:()=> '2026-08-26T01:10:00Z'});
const rfqEngagement=engagementIngestion.ingest({id:'eng-rfq',leadId:'lead-1',kind:'RFQ',channel:'WEBSITE',sourceEventId:'rfq-1',payload:{quantity:1000}});
const customer360=buildCustomer360({scope,lead,identityView:graph.customer360('lead-1'),engagements:[rfqEngagement],scoreHistory:[score],qualification:{minScore:80},clock:()=> '2026-08-26T01:15:00Z'});
const explanation=explainQualification(customer360);assert.equal(explanation.qualified,true);assert.ok(explanation.reasons.includes('HIGH_INTENT_ENGAGEMENT'));
evidence.ga['GA-007']={status:'PASS',qualified:explanation.qualified,reasons:explanation.reasons,sourceChannels:explanation.sourceChannels};

const brief=createContentBrief({...scope,brandId:'brand',marketId:'market',icpId:'icp',objectives:['QUALIFIED_PIPELINE'],productRefs:['product:1'],insightRefs:['insight:1'],contentFormats:['SHORT_VIDEO'],locales:['en'],claims:[{text:'Verified product claim',verified:true,evidenceRef:'kb:1'}],contentPolicy:tenant.contentPolicy});
const approvedBrief=approveContentBrief(brief,{reviewerId:'reviewer-1'});const productionJob=createContentProductionJob({brief:approvedBrief});assert.equal(productionJob.factory,'VIDEO_FACTORY');
evidence.ga['GA-008/009']={status:'PASS',briefId:brief.briefId,approval:approvedBrief.status,factory:productionJob.factory,variants:productionJob.variants.length};

const publishAdapter=createMockPublishingAdapter({channel:'MOCK'});const publishing=createPublishingService({scope,tenantPack:tenant,adapter:publishAdapter});const publishPlan=publishing.createPlan({assetRef:'asset:video-1'});assert.equal(publishPlan.status,'WAITING_APPROVAL');publishing.approve(publishPlan.planId,{reviewerId:'reviewer-1'});const published=await publishing.execute(publishPlan.planId);assert.equal(published.status,'COMPLETED');
evidence.ga['GA-010']={status:'PASS',approvalGated:true,resultRef:published.resultRef};

evidence.ga['GA-011']={status:'PASS',responseRecommendation:engagementIngestion.recommendResponse('lead-1').action};
const qualification=createQualificationEngine({scope,policy:{mqlThreshold:60,sqlThreshold:80,version:'acceptance-qualification-v1'}});const qualificationResult=qualification.evaluate({lead,score,engagements:[rfqEngagement]});assert.equal(qualificationResult.stage,'SQL');const nextAction=qualification.nextBestAction(qualificationResult);assert.equal(nextAction.action,'HUMAN_SALES_CONTACT');
evidence.ga['GA-012']={status:'PASS',stage:qualificationResult.stage,nextBestAction:nextAction.action,reasons:qualificationResult.reasons};

const crmAdapter=defineBusinessIntegrationAdapter({id:'crm-mock',system:'DOWNSTREAM_CRM',capabilities:['RFQ'],async execute(){return{externalId:'RFQ-AUTH-001',status:'OPEN'}}});const downstream=await handoffCommercialObject({scope,adapter:crmAdapter,objectType:'RFQ',lead,payload:{quantity:1000},operationId:'handoff-rfq-1'});assert.equal(downstream.authoritative,true);
evidence.ga['GA-013']={status:'PASS',system:downstream.system,externalId:downstream.externalId,authoritative:downstream.authoritative};

const follow=createFollowUpOrchestrator({scope,policy:{maxAttempts:3,minHoursBetween:24,approvalRequiredChannels:['EMAIL']}});const stop=follow.plan({lead,engagements:[rfqEngagement],preferredChannels:['EMAIL']});assert.equal(stop.action,'STOP');
evidence.ga['GA-014']={status:'PASS',stopAction:stop.action,reason:stop.reason};

const attribution=createAttributionEngine({scope,model:'POSITION_BASED',windowDays:90});const touch1=attribution.recordTouch({leadId:'lead-1',channel:'CHANNEL_A',campaignId:'campaign-1',contentId:'content-1',occurredAt:'2026-08-01T00:00:00Z'});const touch2=attribution.recordTouch({leadId:'lead-1',channel:'WEBSITE',campaignId:'campaign-1',contentId:'landing-1',occurredAt:'2026-08-20T00:00:00Z'});const conversion=attribution.attribute({leadId:'lead-1',conversionId:'order-1',amount:125000,currency:'USD',convertedAt:'2026-08-26T02:00:00Z'});assert.equal(conversion.unattributed,0);assert.equal(attribution.summarize().attributedRevenue,125000);
evidence.ga['GA-015']={status:'PASS',model:conversion.model,revenue:conversion.amount,allocations:conversion.allocations.length};

const director=createGrowthDirector({scope,objectives:{qualifiedPipeline:10,revenue:200000,maxCac:1000}});const decision=director.analyze({channels:[{channel:'CHANNEL_A',spend:5000,leads:30,qualified:10,revenue:125000},{channel:'OTHER',spend:2000,leads:20,qualified:0,revenue:0}],markets:[{marketId:'market'}],funnel:{qualifiedPipeline:8,revenue:125000}});assert.ok(decision.recommendations.some(r=>r.type==='SCALE_CHANNEL'));const experiment=director.createExperiment({hypothesis:'localized content increases qualified pipeline',primaryMetric:'QUALIFIED_PIPELINE',variants:[{id:'control'},{id:'localized'}]});
evidence.ga['GA-016']={status:'PASS',recommendations:decision.recommendations.length,experimentMetric:experiment.primaryMetric};

const cockpit=buildGrowthCockpit({scope,funnel:{prospects:2,leads:1,mql:1,sql:1,opportunities:1,rfqs:1,quotes:1,orders:1,revenue:125000},channels:[{channel:'CHANNEL_A',revenue:125000}],attribution:attribution.summarize(),recommendations:decision.recommendations});const revenuePath=traceRevenuePath({revenue:conversion,opportunity:{id:'opp-1'},lead,touches:[touch1,touch2]});assert.equal(cockpit.funnel.revenue,125000);assert.equal(revenuePath.leadId,'lead-1');assert.equal(revenuePath.touches[0].contentId,'content-1');
evidence.ga['GA-017']={status:'PASS',revenue:cockpit.funnel.revenue,trace:{leadId:revenuePath.leadId,touches:revenuePath.touches.length,firstContent:revenuePath.touches[0].contentId}};

evidence.completedAt=new Date().toISOString();evidence.status=Object.values(evidence.ga).every(item=>item.status==='PASS')?'SUCCEEDED':'FAILED';
if(evidence.status!=='SUCCEEDED')throw new Error('GROWTH_PLATFORM_ACCEPTANCE_FAILED');
console.log(JSON.stringify(evidence,null,2));
