import test from "node:test";
import assert from "node:assert/strict";
import { businessRelationContracts, assertBusinessRelationContract, relationContractsFor } from "../lib/business-relation-definitions.mjs";

test("every independent business platform has one initial typed business chain",()=>{assert.equal(businessRelationContracts.length,6);assert.equal(new Set(businessRelationContracts.map(item=>item.applicationId)).size,6);for(const contract of businessRelationContracts){assert.ok(contract.sourceType);assert.ok(contract.targetType);assert.ok(contract.relationType);assert.equal(relationContractsFor(contract.applicationId,contract.sourceType).length,1);}});
test("relation contracts fail closed for reversed or arbitrary object links",()=>{assert.equal(assertBusinessRelationContract("finance-platform","budget","expense","CONTROLS").label,"预算控制费用");assert.throws(()=>assertBusinessRelationContract("finance-platform","expense","budget","CONTROLS"),error=>error.code==="BUSINESS_RELATION_DENIED");});
