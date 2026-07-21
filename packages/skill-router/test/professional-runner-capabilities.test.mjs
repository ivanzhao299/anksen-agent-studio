import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfessionalRunnerCapabilityRegistry } from "../lib/professional-runner-capabilities.mjs";

test("professional runner inventory distinguishes installed skills, tools and credential references", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-capabilities-")), skillsRoot = join(root, "skills"), bin = join(root, "bin"), registryPath = join(root, "registry.json");
  await mkdir(join(skillsRoot, "video-use"), { recursive: true }); await mkdir(bin);
  await writeFile(join(skillsRoot, "video-use", "SKILL.md"), "---\nname: video-use\n---\n");
  await writeFile(join(bin, "ffmpeg"), "#!/bin/sh\necho ffmpeg-test\n", { mode: 0o755 });
  await writeFile(registryPath, JSON.stringify({ schema_version: 1, registry_id: "test", profiles: [{ profile_id: "editor", display_name: "Editor", runner_class: "FOOTAGE_EDITOR", skill_types: ["video_editing"], skill_packages: ["video-use"], tool_dependencies: [{ command: "ffmpeg", version_args: ["-version"] }], credential_references: ["speech-ref"], allowed_commands: [], blocked_commands: [], allowed_output_roots: [], network_policy: "DENY", side_effect_policy: "ARTIFACT_WRITE_ONLY", max_runtime_seconds: 60, max_parallel_tasks: 1, risk_level: "LOW" }] }));
  const blocked = new ProfessionalRunnerCapabilityRegistry({ registryPath, skillsRoot, env: { PATH: bin } });
  assert.equal((await blocked.resolve("video_editing")).status, "BLOCKED");
  const ready = new ProfessionalRunnerCapabilityRegistry({ registryPath, skillsRoot, env: { PATH: bin }, credentialReferenceIds: ["speech-ref"] });
  const result = await ready.resolve("video_editing"); assert.equal(result.status, "READY"); assert.equal(result.selected_profile_id, "editor");
});

test("unknown professional skill fails closed", async () => {
  const registry = new ProfessionalRunnerCapabilityRegistry();
  const result = await registry.resolve("unknown_media_skill");
  assert.equal(result.status, "BLOCKED"); assert.deepEqual(result.blocked_reasons, ["NO_RUNNER_PROFILE:unknown_media_skill"]);
});
