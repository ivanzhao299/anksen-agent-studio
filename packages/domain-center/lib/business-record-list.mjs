export function normalizeBusinessRecordList(input={}) {
  return {
    query:String(input.query??"").trim().slice(0,100),
    objectType:String(input.objectType??"").trim().slice(0,100),
    status:String(input.status??"").trim().toUpperCase().slice(0,40),
    ownerId:String(input.ownerId??"").trim().slice(0,100),
    limit:Math.max(1,Math.min(Number(input.limit)||20,50)),
    offset:Math.max(0,Number(input.offset)||0)
  };
}

export function businessRecordListResult({items,total,filter,generatedAt,source}) {
  return {
    generatedAt,
    source,
    filter:{query:filter.query,objectType:filter.objectType||null,status:filter.status||null,ownerId:filter.ownerId||null},
    records:items,
    pagination:{limit:filter.limit,offset:filter.offset,total,hasMore:filter.offset+items.length<total}
  };
}
