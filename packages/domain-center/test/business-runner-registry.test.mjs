import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ensurePostgresFixture,createTestPool } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { PostgresBusinessRunnerRegistry } from "../lib/business-runner-registry.mjs";

const ensureMigrations=async pool=>{const client=await pool.connect();try{await client.query("SELECT pg_advisory_lock(739201008)");if(!(await client.query("SELECT to_regclass('business_runner_node') ok")).rows[0].ok){if((await client.query("SELECT to_regclass('ad_goal') ok")).rows[0].ok)await client.query(await readFile(new URL("../../orchestrator-core/migrations/008_business_runner_nodes.up.sql",import.meta.url),"utf8"));else await migrate(client,"up");}}finally{await client.query("SELECT pg_advisory_unlock(739201008)").catch(()=>{});client.release();}};

test("runner registry persists restart, heartbeat, drain CAS and audit evidence",async()=>{
  await ensurePostgresFixture();const pool=createTestPool(),nodeKey=`runner:${randomUUID()}`,registry=new PostgresBusinessRunnerRegistry({pool});
  try{
    await ensureMigrations(pool);const first=await registry.register({nodeKey,capacity:2,metadata:{service:"test",runtimeType:"CONTROLLED_STUB",secret:"must-not-persist"}});assert.equal(first.status,"ONLINE");assert.deepEqual(first.metadata,{service:"test",runtimeType:"CONTROLLED_STUB"});
    const heartbeat=await registry.heartbeat(nodeKey,{activeCount:1,stats:{ticks:2,completed:1}});assert.equal(heartbeat.activeCount,1);const drained=await registry.control(nodeKey,{desiredState:"DRAINING",expectedVersion:heartbeat.version,actorId:"owner"});assert.equal(drained.desiredState,"DRAINING");await assert.rejects(()=>registry.control(nodeKey,{desiredState:"ONLINE",expectedVersion:heartbeat.version,actorId:"owner"}),error=>error.code==="BUSINESS_RUNNER_VERSION_CONFLICT");assert.equal((await registry.heartbeat(nodeKey)).status,"DRAINING");
    const restarted=await registry.register({nodeKey,capacity:3,metadata:{service:"test",runtimeType:"CONTROLLED_STUB"}});assert.equal(restarted.id,first.id);assert.equal(restarted.desiredState,"DRAINING");assert.equal(restarted.capacity,3);const dashboard=await registry.dashboard();assert.equal(dashboard.nodes.find(node=>node.nodeKey===nodeKey).status,"DRAINING");assert.ok(dashboard.events.some(event=>event.nodeKey===nodeKey&&event.type==="business.runner.controlled"));assert.equal(JSON.stringify(await pool.query("SELECT metadata FROM business_runner_node WHERE node_key=$1",[nodeKey])).includes("must-not-persist"),false);assert.equal((await registry.stop(nodeKey)).status,"OFFLINE");
  }finally{await pool.end();}
});

test("runner registry projects stale heartbeats as offline without rewriting evidence",async()=>{
  await ensurePostgresFixture();const pool=createTestPool(),nodeKey=`runner:${randomUUID()}`,now=new Date("2026-07-21T01:00:00.000Z"),registry=new PostgresBusinessRunnerRegistry({pool,clock:()=>now,offlineAfterMs:3000});try{await ensureMigrations(pool);await registry.register({nodeKey});now.setSeconds(now.getSeconds()+4);const node=(await registry.dashboard()).nodes.find(value=>value.nodeKey===nodeKey);assert.equal(node.status,"OFFLINE");assert.equal(node.persistedStatus,"ONLINE");}finally{await pool.end();}
});
