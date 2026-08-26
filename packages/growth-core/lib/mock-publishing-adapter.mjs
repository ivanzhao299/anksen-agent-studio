import { defineChannelAdapter, assertAdapterCanExecute } from './channel-adapter.mjs';

export function createMockPublishingAdapter({channel='MOCK',failuresBeforeSuccess=0}={}){
  const definition=defineChannelAdapter({id:`mock-publish-${channel.toLowerCase()}`,channel,transport:'READ_ONLY_FIXTURE',capabilities:['PUBLISH_CONTENT'],riskLevel:'LOW'});
  let attempts=0;
  return Object.freeze({...definition,async publish({scope,operationId,assetRef}){assertAdapterCanExecute({adapter:definition,scope,capability:'PUBLISH_CONTENT',operationId});attempts+=1;if(attempts<=failuresBeforeSuccess){const error=new Error('simulated publish failure');error.code='SIMULATED_FAILURE';throw error;}return Object.freeze({externalId:`mock_post_${attempts}`,assetRef,publishedAt:new Date().toISOString()});},getAttempts(){return attempts;}});
}
