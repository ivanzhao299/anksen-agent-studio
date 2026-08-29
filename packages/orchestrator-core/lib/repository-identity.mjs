import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

const git = (repoRoot, args) => execFileSync("git", args, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
}).trim();

const canonicalRemote = value => String(value ?? "")
  .trim()
  .replace(/^git@github\.com:/, "https://github.com/")
  .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
  .replace(/\/$/, "")
  .replace(/\.git$/, "")
  .toLowerCase();

export function inspectRepositoryIdentity(repoRoot) {
  const expectedRoot = realpathSync(resolve(repoRoot));
  const manifest = JSON.parse(readFileSync(resolve(expectedRoot, "studio-project.json"), "utf8"));
  const packageManifest = JSON.parse(readFileSync(resolve(expectedRoot, "package.json"), "utf8"));
  const gitRoot = realpathSync(git(expectedRoot, ["rev-parse", "--show-toplevel"]));
  const origin = git(expectedRoot, ["remote", "get-url", "origin"]);
  const checks = {
    git_root: gitRoot === expectedRoot,
    remote: canonicalRemote(origin) === canonicalRemote(manifest.canonical_remote),
    project_id: manifest.project_id === "anksen-agent-studio"
      && packageManifest.name === manifest.package_name
      && manifest.package_name === manifest.project_id
  };
  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "BLOCKED",
    checks,
    expected_root: expectedRoot,
    git_root: gitRoot,
    origin,
    project_id: manifest.project_id,
    package_name: packageManifest.name,
    canonical_remote: manifest.canonical_remote
  };
}

export function assertRepositoryIdentity(repoRoot) {
  let result;
  try {
    result = inspectRepositoryIdentity(repoRoot);
  } catch (error) {
    throw Object.assign(new Error(`STUDIO_REPOSITORY_IDENTITY_BLOCKED: ${error.message}`), {
      code: "STUDIO_REPOSITORY_IDENTITY_BLOCKED",
      cause: error
    });
  }
  if (result.status !== "PASS") {
    throw Object.assign(new Error(`STUDIO_REPOSITORY_IDENTITY_BLOCKED: ${JSON.stringify(result.checks)}`), {
      code: "STUDIO_REPOSITORY_IDENTITY_BLOCKED",
      evidence: result
    });
  }
  return result;
}
