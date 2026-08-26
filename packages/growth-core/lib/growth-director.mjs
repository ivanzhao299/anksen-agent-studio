import { assertTenantScope } from './domain-model.mjs';

export function createGrowthDirector({scope:rawScope,objectives={},clock=()=>new Date().toISOString()}={}){
  const scope=assertTenantScope(rawScope);const experiments=[];const decisions=[];
  const objective={qualifiedPipeline:Number(objectives.qualifiedPipeline??0),revenue:Number(objectives.revenue??0),maxCac:Number(objectives.maxCac??Infinity)};
  function analyze({channels=[],markets=[],content=[],funnel={}}={}){
    const normalized=channels.map(row=>({channel:row.channel,spend:Number(row.spend??0),leads:Number(row.leads??0),qualified:Number(row.qualified??0),revenue:Number(row.revenue??0),cac:Number(row.qualified??0)>0?Number(row.spend??0)/Number(row.qualified):Infinity,leadToQualified:Number(row.leads??0)>0?Number(row.qualified??0)/Number(row.leads):0,roas:Number(row.spend??0)>0?Number(row.revenue??0)/Number(row.spend):null}));
    const ranked=[...normalized].sort((a,b)=>(b.revenue||0)-(a.revenue||0)||b.leadToQualified-a.leadToQualified);
    const recommendations=[];
    const best=ranked[0];
    if(best&&best.qualified>0&&best.cac<=objective.maxCac)recommendations.push({type:'SCALE_CHANNEL',channel:best.channel,reason:'BEST_REVENUE_AND_QUALIFIED_EFFICIENCY',evidence:{revenue:best.revenue,qualified:best.qualified,cac:best.cac}});
    for(const row of ranked.filter(r=>r.spend>0&&r.qualified===0))recommendations.push({type:'REDUCE_OR_FIX_CHANNEL',channel:row.channel,reason:'SPEND_WITHOUT_QUALIFIED_PIPELINE',evidence:{spend:row.spend,leads:row.leads}});
    const underTarget=Number(funnel.qualifiedPipeline??0)<objective.qualifiedPipeline||Number(funnel.revenue??0)<objective.revenue;
    if(underTarget&&markets.length)recommendations.push({type:'RUN_MARKET_ICP_EXPERIMENT',marketId:markets[0].marketId,reason:'BUSINESS_OBJECTIVE_GAP'});
    const decision=Object.freeze({decisionId:`growth_decision_${crypto.randomUUID()}`,...scope,objective:Object.freeze({...objective}),metrics:Object.freeze({channels:Object.freeze(normalized),funnel:Object.freeze({...funnel})}),recommendations:Object.freeze(recommendations.map(r=>Object.freeze(r))),generatedAt:clock()});decisions.push(decision);return decision;
  }
  function createExperiment({hypothesis,primaryMetric='QUALIFIED_PIPELINE',variants=[],guardrails={}}={}){if(!hypothesis||variants.length<2)throw new TypeError('hypothesis and at least two variants are required');if(['LIKES','FOLLOWERS','IMPRESSIONS'].includes(primaryMetric))throw new Error('vanity metric cannot be primary optimization target');const experiment=Object.freeze({experimentId:`exp_${crypto.randomUUID()}`,...scope,hypothesis,primaryMetric,variants:Object.freeze(variants.map(v=>Object.freeze({...v}))),guardrails:Object.freeze({...guardrails}),status:'DRAFT',createdAt:clock()});experiments.push(experiment);return experiment;}
  return{analyze,createExperiment,decisions,experiments};
}
