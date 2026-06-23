#!/usr/bin/env node
import { buildRuntimeHealth, loadRuntimeCenter } from "../lib/runtime-center-utils.mjs";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    json: argv.includes("--json")
  };
}

function printMarkdown(payload, providersCount, profilesCount) {
  console.log("# Runtime Health Check");
  console.log("");
  console.log(`mode: ${payload.dry_run ? "dry-run" : "registry-only"}`);
  console.log(`providers: ${providersCount}`);
  console.log(`runtimes: ${profilesCount}`);
  console.log("network_probes: disabled");
  console.log("credential_values: not read");
  console.log("");
  console.log("| Provider | Runtime | Status | Latency | Auth | Available Skills |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const result of payload.results) {
    console.log(
      `| ${result.provider} | ${result.runtime} | ${result.status} | ${result.latency_ms ?? "n/a"} | ${result.auth_status} | ${result.available_skills.join(", ")} |`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dryRun) {
    console.error("runtime-health-check currently supports --dry-run only. Active probes require a future credential vault gate.");
    process.exitCode = 1;
    return;
  }

  const center = await loadRuntimeCenter();
  const payload = buildRuntimeHealth(center, true);

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printMarkdown(payload, center.providers.providers?.length ?? 0, center.profiles.profiles?.length ?? 0);
}

await main();
