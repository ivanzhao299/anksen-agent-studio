#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(binDir, "..");
const providersPath = resolve(packageRoot, "examples/runtime-providers.example.json");
const profilesPath = resolve(packageRoot, "examples/runtime-profiles.example.json");

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    json: argv.includes("--json")
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolveAuthStatus(provider) {
  const authModes = provider?.auth_modes ?? [];
  if (authModes.includes("none")) return "not_required";
  return "reference_only";
}

function resolveStatus(provider, profile) {
  if (profile?.health_status && profile.health_status !== "unknown") return profile.health_status;
  return provider?.health_status ?? "unknown";
}

function buildHealthResults(providersRegistry, profilesRegistry, dryRun) {
  const providers = new Map((providersRegistry.providers ?? []).map((provider) => [provider.provider_id, provider]));

  return (profilesRegistry.profiles ?? []).map((profile) => {
    const provider = providers.get(profile.provider);
    return {
      provider: profile.provider,
      runtime: profile.runtime_id,
      status: resolveStatus(provider, profile),
      latency_ms: dryRun ? null : null,
      auth_status: resolveAuthStatus(provider),
      available_skills: profile.supported_skills ?? [],
      notes: dryRun
        ? "Dry-run only: no network, browser, CLI login, or remote worker health probe was executed."
        : "MVP health check is registry-based; active probes are intentionally disabled until credentials are configured."
    };
  });
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

  const providers = await readJson(providersPath);
  const profiles = await readJson(profilesPath);
  const payload = {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    dry_run: true,
    results: buildHealthResults(providers, profiles, true)
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  printMarkdown(payload, providers.providers?.length ?? 0, profiles.profiles?.length ?? 0);
}

await main();
