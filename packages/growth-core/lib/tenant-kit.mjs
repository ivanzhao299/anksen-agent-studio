import { assertTenantScope } from './domain-model.mjs';

const requiredString=(obj,key)=>{if(typeof obj?.[key]!=='string'||!obj[key].trim())throw new TypeError(`${key} is required`);return obj[key].trim()};
const unique=(values)=>[...new Set(values??[])];

export function defineTenantPack(input){
  const scope=assertTenantScope(input);
  const name=requiredString(input,'name');
  const brands=(input.brands??[]).map((brand)=>Object.freeze({id:requiredString(brand,'id'),name:requiredString(brand,'name'),domains:Object.freeze(unique(brand.domains)),locales:Object.freeze(unique(brand.locales??[input.locale??'en']))}));
  const markets=(input.markets??[]).map((market)=>Object.freeze({id:requiredString(market,'id'),country:requiredString(market,'country'),locale:market.locale??input.locale??'en',currency:market.currency??'USD',timezone:market.timezone??input.timezone??'UTC'}));
  const icps=(input.icps??[]).map((icp)=>Object.freeze({id:requiredString(icp,'id'),name:requiredString(icp,'name'),roles:Object.freeze(unique(icp.roles)),industries:Object.freeze(unique(icp.industries)),companySizes:Object.freeze(unique(icp.companySizes)),markets:Object.freeze(unique(icp.markets)),signals:Object.freeze([...(icp.signals??[])])}));
  const channelPolicies=Object.freeze(Object.fromEntries(Object.entries(input.channelPolicies??{}).map(([channel,policy])=>[channel,Object.freeze({enabled:policy.enabled!==false,allowedCapabilities:Object.freeze(unique(policy.allowedCapabilities)),requiresApproval:Object.freeze(unique(policy.requiresApproval)),dailyWriteLimit:Number(policy.dailyWriteLimit??0),metadata:Object.freeze({...policy.metadata})})])));
  if(!brands.length)throw new TypeError('at least one brand is required');
  if(!markets.length)throw new TypeError('at least one market is required');
  if(!icps.length)throw new TypeError('at least one ICP is required');
  return Object.freeze({...scope,type:'growth_tenant_pack',name,locale:input.locale??'en',timezone:input.timezone??'UTC',brands:Object.freeze(brands),markets:Object.freeze(markets),icps:Object.freeze(icps),productRefs:Object.freeze([...(input.productRefs??[])]),channelPolicies,qualification:Object.freeze({...input.qualification}),attribution:Object.freeze({...input.attribution}),contentPolicy:Object.freeze({...input.contentPolicy}),metadata:Object.freeze({...input.metadata})});
}

export function assertTenantChannelAction(pack,{channel,capability}){
  const policy=pack.channelPolicies?.[channel];
  if(!policy?.enabled)throw new Error(`channel disabled: ${channel}`);
  if(!policy.allowedCapabilities.includes(capability))throw new Error(`capability denied by tenant policy: ${channel}/${capability}`);
  return Object.freeze({allowed:true,approvalRequired:policy.requiresApproval.includes(capability),dailyWriteLimit:policy.dailyWriteLimit});
}

export function selectIcp(pack,{marketId,role,industry}={}){
  return pack.icps.filter((icp)=>(!marketId||!icp.markets.length||icp.markets.includes(marketId))&&(!role||!icp.roles.length||icp.roles.includes(role))&&(!industry||!icp.industries.length||icp.industries.includes(industry)));
}
