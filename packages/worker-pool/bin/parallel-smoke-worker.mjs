#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    agent: "",
    runId: "",
    workspace: "",
    repoRoot: "",
    task: "",
    source: "",
    delayMs: 800
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--agent") {
      args.agent = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--run-id") {
      args.runId = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--workspace") {
      args.workspace = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--repo-root") {
      args.repoRoot = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--task") {
      args.task = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--source") {
      args.source = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--delay-ms") {
      args.delayMs = Number(argv[index + 1] ?? "800");
      index += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function markdown(result) {
  return `# Parallel Smoke Worker Log

- agent: ${result.agent}
- run_id: ${result.run_id}
- task: ${result.task}
- pid: ${result.pid}
- ppid: ${result.ppid}
- workspace: ${result.workspace}
- source_path: ${result.source_path}
- bytes_read: ${result.bytes_read}
- started_at: ${result.started_at}
- completed_at: ${result.completed_at}
- duration_ms: ${result.duration_ms}
- status: ${result.status}

## Safety

- external_model_call: disabled
- server_access: disabled
- deploy: disabled
- production_operation: disabled
- credential_values: not_read
- managed_project_writes: disabled
- jinhu_smart_park_writes: disabled
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  await mkdir(args.workspace, { recursive: true });

  let sourceText = "";
  let status = "PASS";
  let error = "";
  try {
    sourceText = await readFile(resolve(args.repoRoot, args.source), "utf8");
    await sleep(args.delayMs);
  } catch (caught) {
    status = "FAIL";
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const completedAtMs = Date.now();
  const result = {
    schema_version: 1,
    agent: args.agent,
    run_id: args.runId,
    task: args.task,
    pid: process.pid,
    ppid: process.ppid,
    workspace: args.workspace,
    source_path: args.source,
    bytes_read: sourceText.length,
    started_at: startedAt,
    started_at_ms: startedAtMs,
    completed_at: new Date(completedAtMs).toISOString(),
    completed_at_ms: completedAtMs,
    duration_ms: completedAtMs - startedAtMs,
    status,
    error,
    safety: {
      external_model_call: "disabled",
      server_access: "disabled",
      deploy: "disabled",
      production_operation: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled",
      jinhu_smart_park_writes: "disabled"
    }
  };

  const jsonPath = resolve(args.workspace, "run-log.json");
  const markdownPath = resolve(args.workspace, "run-log.md");
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown(result), "utf8");
  console.log(JSON.stringify(result));
  if (status !== "PASS") process.exitCode = 1;
}

await main();
