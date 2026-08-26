import { assertTenantScope } from './domain-model.mjs';

const check=(id,pass,evidence,required=true)=>Object.freeze({id,pass:Boolean(pass),required,evidence:evidence??null});
const activeExternalChannels=pack=>Object.entries(pack.channelPolicies??{}).filter(([channel,policy])=>channel!=='WEBSITE'&&policy.enabled&&policy.allowedCapabilities?.length).map(([channel])=>channel);

export function assessGrowthPilotReadiness({tenantPack,connectors=[],governance={},operations={}}={}){
  const scope=assertTenantScope(tenantPack),connectorKinds=new Map(connectors.map(item=>[item.kind,item])),externalChannels=activeExternalChannels(tenantPack);
  const implementation=[
    check('TENANT_PACK_VALID',tenantPack.brands?.length&&tenantPack.markets?.length&&tenantPack.icps?.length,{brands:tenantPack.brands?.length??0,markets:tenantPack.markets?.length??0,icps:tenantPack.icps?.length??0}),
    check('PRODUCT_REFERENCES_CONFIGURED',tenantPack.productRefs?.length>0,{count:tenantPack.productRefs?.length??0}),
    check('PILOT_CHANNEL_SCOPE',tenantPack.channelPolicies?.WEBSITE?.enabled&&externalChannels.length>=2,{website:Boolean(tenantPack.channelPolicies?.WEBSITE?.enabled),externalChannels}),
    check('SIGNED_WEBSITE_CONNECTOR',connectorKinds.get('WEBSITE_INBOUND')?.transport==='SIGNED_WEBHOOK'&&connectorKinds.get('WEBSITE_INBOUND')?.configured===true,{configured:Boolean(connectorKinds.get('WEBSITE_INBOUND')?.configured),transport:connectorKinds.get('WEBSITE_INBOUND')?.transport??null}),
    check('OFFICIAL_PUBLISHING_CONNECTOR',connectorKinds.get('PUBLISHING')?.transport==='OFFICIAL_API'&&connectorKinds.get('PUBLISHING')?.configured===true,{configured:Boolean(connectorKinds.get('PUBLISHING')?.configured),transport:connectorKinds.get('PUBLISHING')?.transport??null}),
    check('OFFICIAL_BUSINESS_CONNECTOR',connectorKinds.get('BUSINESS_HANDOFF')?.transport==='OFFICIAL_API'&&connectorKinds.get('BUSINESS_HANDOFF')?.configured===true,{configured:Boolean(connectorKinds.get('BUSINESS_HANDOFF')?.configured),transport:connectorKinds.get('BUSINESS_HANDOFF')?.transport??null}),
    check('PERSISTENCE_MIGRATIONS',governance.persistenceMigrationsApplied===true,{applied:Boolean(governance.persistenceMigrationsApplied)}),
    check('DELIVERY_AUDIT_AND_LEDGER',governance.deliveryLedgerEnabled===true&&governance.deliveryAuditEnabled===true,{ledger:Boolean(governance.deliveryLedgerEnabled),audit:Boolean(governance.deliveryAuditEnabled)}),
    check('SECOND_TENANT_VALIDATED',governance.secondTenantValidated===true,{validated:Boolean(governance.secondTenantValidated)}),
  ];
  const activation=[
    check('WEBSITE_CREDENTIAL_REFERENCE',connectorKinds.get('WEBSITE_INBOUND')?.credentialReferenceConfigured===true,{configured:Boolean(connectorKinds.get('WEBSITE_INBOUND')?.credentialReferenceConfigured)}),
    check('PUBLISHING_CREDENTIAL_REFERENCE',connectorKinds.get('PUBLISHING')?.credentialReferenceConfigured===true,{configured:Boolean(connectorKinds.get('PUBLISHING')?.credentialReferenceConfigured)}),
    check('BUSINESS_CREDENTIAL_REFERENCE',connectorKinds.get('BUSINESS_HANDOFF')?.credentialReferenceConfigured===true,{configured:Boolean(connectorKinds.get('BUSINESS_HANDOFF')?.credentialReferenceConfigured)}),
    check('CONNECTOR_HEALTH',connectors.length>=3&&connectors.every(item=>item.health==='HEALTHY'),{healthy:connectors.filter(item=>item.health==='HEALTHY').length,total:connectors.length}),
    check('DATA_OWNER_APPROVAL',governance.dataOwnerApproval===true,{approved:Boolean(governance.dataOwnerApproval)}),
    check('PUBLISHING_APPROVAL_POLICY',governance.publishingApprovalPolicy===true,{enabled:Boolean(governance.publishingApprovalPolicy)}),
    check('BUSINESS_HANDOFF_APPROVAL_POLICY',governance.businessHandoffApprovalPolicy===true,{enabled:Boolean(governance.businessHandoffApprovalPolicy)}),
    check('NO_IDENTITY_REVIEW_BACKLOG',Number(operations.identityReviewBacklog??0)===0,{count:Number(operations.identityReviewBacklog??0)}),
    check('NO_DELIVERY_FAILURES',Number(operations.failedDeliveries??0)===0,{count:Number(operations.failedDeliveries??0)}),
    check('RECONCILIATION_MATCHED',Number(operations.reconciliationMismatches??0)===0,{count:Number(operations.reconciliationMismatches??0)}),
    check('PRODUCTION_FEATURE_FLAG',governance.productionFeatureFlag===true,{enabled:Boolean(governance.productionFeatureFlag)}),
    check('RUNTIME_ACTIVATION_GATE',governance.runtimeActivationGatePassed===true,{passed:Boolean(governance.runtimeActivationGatePassed)}),
    check('EXPLICIT_PRODUCTION_AUTHORIZATION',governance.explicitProductionAuthorization===true,{authorized:Boolean(governance.explicitProductionAuthorization)}),
  ];
  const implementationReady=implementation.every(item=>item.pass),activationReady=activation.every(item=>item.pass),status=!implementationReady?'IMPLEMENTATION_BLOCKED':activationReady?'PILOT_ACTIVATION_READY':'PILOT_ACTIVATION_BLOCKED';
  return Object.freeze({...scope,status,implementationReady,activationReady,implementation:Object.freeze(implementation),activation:Object.freeze(activation),blockers:Object.freeze([...implementation,...activation].filter(item=>item.required&&!item.pass).map(item=>item.id)),safety:Object.freeze({externalWritesPerformed:false,productionChanged:false,runtimeEnabledByAssessment:false}),generatedAt:new Date().toISOString()});
}
