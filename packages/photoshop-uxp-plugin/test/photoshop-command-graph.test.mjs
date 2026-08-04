import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { compilePhotoshopCommandGraph, CommandGraphValidationError } = require("../src/photoshop-command-graph.cjs");

const textCommand = { operation: "CREATE_TEXT_LAYER", parameters: { name: "10_TITLE", text: "Design without templates", position: { x: 100, y: 200 }, fontSize: 64, color: { red: 10, green: 20, blue: 30 } } };

test("compiles a deterministic document-local command DAG and preserves node output references", () => {
  const graph = compilePhotoshopCommandGraph({ graphId: "poster-a", nodes: [
    { nodeId: "title", command: textCommand },
    { nodeId: "style-title", dependsOn: ["title"], command: { operation: "SET_TEXT_STYLE", target: { nodeOutput: "title" }, parameters: { tracking: 80, horizontalScale: 100 } } },
    { nodeId: "save", dependsOn: ["style-title"], command: { operation: "SAVE_COPY", parameters: { format: "psd" } } }
  ] });
  assert.deepEqual(graph.operations.map(item => item.operationId), ["title", "style-title", "save"]);
  assert.equal(graph.operations[1].target.nodeOutput, "title");
  assert.equal(graph.summary.edges, 2);
});

test("rejects cycles, undeclared output dependencies, and non-terminal output nodes", () => {
  assert.throws(() => compilePhotoshopCommandGraph({ nodes: [
    { nodeId: "a", dependsOn: ["b"], command: textCommand },
    { nodeId: "b", dependsOn: ["a"], command: { ...textCommand, parameters: { ...textCommand.parameters, name: "B" } } }
  ] }), CommandGraphValidationError);
  assert.throws(() => compilePhotoshopCommandGraph({ nodes: [
    { nodeId: "title", command: textCommand },
    { nodeId: "style", command: { operation: "SET_OPACITY", target: { nodeOutput: "title" }, parameters: { opacity: 80 } } }
  ] }), /declared in dependsOn/);
  assert.throws(() => compilePhotoshopCommandGraph({ nodes: [
    { nodeId: "save", command: { operation: "SAVE_COPY", parameters: { format: "psd" } } },
    { nodeId: "later", dependsOn: ["save"], command: textCommand }
  ] }), /output nodes must be terminal/);
});
