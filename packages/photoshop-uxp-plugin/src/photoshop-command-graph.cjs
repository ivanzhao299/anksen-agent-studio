"use strict";

const { validateOperation, validateOperationPlan } = require("./operation-dsl.cjs");

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

class CommandGraphValidationError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message);
    this.name = "CommandGraphValidationError";
    this.path = path || null;
  }
}

function assert(condition, message, path) {
  if (!condition) throw new CommandGraphValidationError(message, path);
}

// This graph only orders Photoshop commands within one existing Studio task.
// It deliberately has no scheduling, retries, persistence, status machine, or
// workers and therefore does not duplicate the Studio Task Graph.
function compilePhotoshopCommandGraph(input, options = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "must be an object", "commandGraph");
  assert(Number(input.schemaVersion || 1) === 1, "unsupported graph schema version", "commandGraph.schemaVersion");
  assert(Array.isArray(input.nodes), "must be an array", "commandGraph.nodes");
  assert(input.nodes.length > 0, "must contain at least one node", "commandGraph.nodes");
  assert(input.nodes.length <= (options.maxNodes || 200), `must contain at most ${options.maxNodes || 200} nodes`, "commandGraph.nodes");

  const byId = new Map();
  const indexById = new Map();
  for (const [index, node] of input.nodes.entries()) {
    const path = `commandGraph.nodes.${index}`;
    assert(node && typeof node === "object" && !Array.isArray(node), "must be an object", path);
    const nodeId = String(node.nodeId || "");
    assert(SAFE_ID.test(nodeId), "must be a safe identifier", `${path}.nodeId`);
    assert(!byId.has(nodeId), "must be unique", `${path}.nodeId`);
    const dependsOn = node.dependsOn || [];
    assert(Array.isArray(dependsOn), "must be an array", `${path}.dependsOn`);
    const uniqueDependencies = [...new Set(dependsOn.map(String))];
    assert(uniqueDependencies.length === dependsOn.length, "must not contain duplicates", `${path}.dependsOn`);
    for (const dependency of uniqueDependencies) assert(SAFE_ID.test(dependency), "must be a safe identifier", `${path}.dependsOn`);
    const command = { ...node.command, operationId: nodeId, idempotencyKey: node.command?.idempotencyKey || nodeId };
    const operation = validateOperation(command, index);
    byId.set(nodeId, { nodeId, dependsOn: uniqueDependencies, operation });
    indexById.set(nodeId, index);
  }

  for (const node of byId.values()) {
    assert(!node.dependsOn.includes(node.nodeId), "cannot depend on itself", `commandGraph.nodes.${node.nodeId}.dependsOn`);
    for (const dependency of node.dependsOn) assert(byId.has(dependency), `unknown dependency ${dependency}`, `commandGraph.nodes.${node.nodeId}.dependsOn`);
    const outputRef = node.operation.target?.nodeOutput;
    if (outputRef) {
      assert(byId.has(outputRef), `unknown node output ${outputRef}`, `commandGraph.nodes.${node.nodeId}.command.target.nodeOutput`);
      assert(node.dependsOn.includes(outputRef), "nodeOutput must also be declared in dependsOn", `commandGraph.nodes.${node.nodeId}.dependsOn`);
    }
  }

  const indegree = new Map([...byId.keys()].map(id => [id, 0]));
  const children = new Map([...byId.keys()].map(id => [id, []]));
  for (const node of byId.values()) {
    indegree.set(node.nodeId, node.dependsOn.length);
    for (const dependency of node.dependsOn) children.get(dependency).push(node.nodeId);
  }
  const ready = [...byId.keys()].filter(id => indegree.get(id) === 0).sort((a, b) => indexById.get(a) - indexById.get(b));
  const ordered = [];
  while (ready.length) {
    const id = ready.shift();
    ordered.push(byId.get(id));
    for (const child of children.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) {
        ready.push(child);
        ready.sort((a, b) => indexById.get(a) - indexById.get(b));
      }
    }
  }
  assert(ordered.length === byId.size, "contains a dependency cycle", "commandGraph.nodes");
  for (const node of ordered) {
    const isOutput = node.operation.operation === "SAVE_COPY" || node.operation.operation === "EXPORT_DOCUMENT";
    if (isOutput) assert(children.get(node.nodeId).length === 0, "output nodes must be terminal", `commandGraph.nodes.${node.nodeId}`);
  }
  const plan = validateOperationPlan(ordered.map(item => item.operation), { maxOperations: options.maxNodes || 200 });
  return Object.freeze({
    schemaVersion: 1,
    graphId: String(input.graphId || "photoshop-command-graph"),
    operations: plan.operations,
    capabilityProfile: plan.capabilityProfile,
    summary: Object.freeze({ ...plan.summary, nodes: ordered.length, edges: ordered.reduce((sum, item) => sum + item.dependsOn.length, 0) })
  });
}

module.exports = { CommandGraphValidationError, compilePhotoshopCommandGraph };
