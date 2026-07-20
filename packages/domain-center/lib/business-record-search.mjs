import { assertEnterpriseApplication } from "./enterprise-applications.mjs";
import { getBusinessObjectDefinition } from "./business-object-definitions.mjs";

export function normalizeBusinessSearch(input={}) {
  return { query:String(input.query??"").trim().slice(0,100), status:String(input.status??"").trim().toUpperCase().slice(0,40), ownerId:String(input.ownerId??"").trim().slice(0,100), applicationIds:[...new Set(input.applicationIds??[])], limit:Math.max(1,Math.min(Number(input.limit)||20,50)), offset:Math.max(0,Number(input.offset)||0) };
}

export function presentBusinessSearchRecord(record) {
  const application=assertEnterpriseApplication(record.applicationId),schema=getBusinessObjectDefinition(application.id,record.objectType);
  return { id:record.id,applicationId:application.id,applicationName:application.name,objectType:record.objectType,objectTypeName:schema.label,displayKey:record.displayKey,title:record.title,status:record.status,ownerId:record.ownerId,version:record.version,updatedAt:record.updatedAt,href:`${application.path}?record=${record.id}` };
}

export function businessSearchResult({items,total,search,generatedAt,source}) {
  return {generatedAt,source,query:{text:search.query,status:search.status||null,ownerId:search.ownerId||null,applicationIds:search.applicationIds},items,pagination:{limit:search.limit,offset:search.offset,total,hasMore:search.offset+items.length<total}};
}
