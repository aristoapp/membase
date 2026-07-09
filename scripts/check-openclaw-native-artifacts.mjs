#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = "clients/openclaw/native-artifacts.json";
const OLD_REPO = "aristoapp/openclaw-membase";
const OLD_TREE_SHA = "b5e2838cd053ab833426aaaf03b47a8b9921ad25";

const expectedArtifacts = [
  ["package.json", "package-metadata", "represented"],
  [".github/workflows/check.yml", "workflow", "represented"],
  ["openclaw.plugin.json", "plugin-metadata", "represented"],
  ["index.ts", "native-entrypoint", "represented"],
  ["src/index.ts", "native-runtime", "deferred-review-only"],
  ["src/config.ts", "native-config", "deferred-review-only"],
  ["src/client.ts", "runtime-client", "deferred-review-only"],
  ["src/commands/cli.ts", "openclaw-command", "deferred-review-only"],
  ["src/hooks/capture.ts", "openclaw-hook", "deferred-review-only"],
  ["src/hooks/recall.ts", "openclaw-hook", "deferred-review-only"],
  ["src/tools/add-wiki.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/current-date.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/delete-wiki.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/forget.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/profile.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/search-wiki.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/search.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/store.ts", "openclaw-tool", "deferred-review-only"],
  ["src/tools/update-wiki.ts", "openclaw-tool", "deferred-review-only"],
  ["src/format.ts", "display-formatting", "deferred-review-only"],
  ["src/star-prompt.ts", "launch-prompt", "deferred-review-only"],
  ["src/update-check.ts", "update-check", "deferred-review-only"],
  ["src/wiki-project.ts", "wiki-project", "deferred-review-only"],
  ["src/membase-tools.test.ts", "test-evidence", "deferred-review-only"],
  ["src/star-prompt.test.ts", "test-evidence", "deferred-review-only"],
  ["src/update-check.test.ts", "test-evidence", "deferred-review-only"]
];

const failures = [];
const snapshot = readJson(SNAPSHOT_PATH);

if (snapshot) {
  assert(snapshot.source?.repo === OLD_REPO, `${SNAPSHOT_PATH}: source.repo must be ${OLD_REPO}`);
  assert(snapshot.source?.treeSha === OLD_TREE_SHA, `${SNAPSHOT_PATH}: source.treeSha is stale or missing`);
  // Runtime copied into clients/openclaw/runtime (Group B, pure copy-in), so the
  // snapshot is now a historical inventory of the ported source.
  assert(snapshot.policy?.status === "ported", `${SNAPSHOT_PATH}: policy.status must be "ported" after copy-in`);

  const artifacts = Array.isArray(snapshot.artifacts) ? snapshot.artifacts : [];
  assert(artifacts.length === expectedArtifacts.length, `${SNAPSHOT_PATH}: expected ${expectedArtifacts.length} artifacts`);
  for (const [artifactPath] of expectedArtifacts) {
    const artifact = artifacts.find((item) => item.path === artifactPath);
    assert(Boolean(artifact), `${SNAPSHOT_PATH}: missing artifact ${artifactPath}`);
    if (artifact) {
      assert(!Object.hasOwn(artifact, "content"), `${SNAPSHOT_PATH}: ${artifactPath} must not inline old file content`);
    }
  }
}

assertOpenClawMetadataStillRuntimeFree();
assertRuntimePortedIn();
assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("OpenClaw native artifact snapshot check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OpenClaw native artifact snapshot check passed.");

function assertOpenClawMetadataStillRuntimeFree() {
  for (const manifestPath of ["clients/openclaw/openclaw.plugin.json", "manifests/openclaw/plugin.json"]) {
    const manifest = readJson(manifestPath);
    if (!manifest) {
      continue;
    }

    for (const field of ["commands", "hooks", "tools"]) {
      assert(!Object.hasOwn(manifest, field), `${manifestPath}: ${field} must stay omitted until native artifacts are ported`);
    }

    assert(
      Array.isArray(manifest.skills) && manifest.skills.length === 1 && manifest.skills[0] === "skills",
      `${manifestPath}: skills directory declaration should remain metadata-only until skills are ported`
    );
  }
}

// After copy-in, the runtime lives in clients/openclaw/runtime/ (kept separate
// from the adapter at clients/openclaw/src/index.ts). Assert the runtime IS
// present there, and that it did NOT land in the adapter's src/ (which must stay
// adapter-only). Source inspection only — no import/build of the runtime here.
function assertRuntimePortedIn() {
  const runtime = "clients/openclaw/runtime/src";
  for (const relativePath of [
    `${runtime}/index.ts`,
    `${runtime}/client.ts`,
    `${runtime}/config.ts`,
    `${runtime}/commands/cli.ts`,
    `${runtime}/hooks/capture.ts`,
    `${runtime}/hooks/recall.ts`,
    `${runtime}/tools/search.ts`,
    `${runtime}/tools/store.ts`,
    `${runtime}/tools/forget.ts`
  ]) {
    assert(fs.existsSync(path.join(ROOT_DIR, relativePath)), `${relativePath}: runtime file missing after copy-in`);
  }

  // The adapter package must remain adapter-only (runtime went to runtime/).
  for (const relativePath of [
    "clients/openclaw/src/client.ts",
    "clients/openclaw/src/config.ts",
    "clients/openclaw/src/tools/search.ts"
  ]) {
    assert(!fs.existsSync(path.join(ROOT_DIR, relativePath)), `${relativePath}: runtime must live under runtime/, not the adapter src/`);
  }
}

function assertPackageCheckComposition() {
  const packageJson = readJson("package.json");
  const nativeArtifactScript = packageJson?.scripts?.["openclaw:native-artifacts"];
  assert(
    nativeArtifactScript === "node scripts/check-openclaw-native-artifacts.mjs",
    "package.json: scripts.openclaw:native-artifacts is missing or unexpected"
  );

  const checkScript = packageJson?.scripts?.check;
  assert(
    typeof checkScript === "string" && checkScript.includes("openclaw:native-artifacts"),
    "package.json: scripts.check does not include openclaw:native-artifacts"
  );
}

function readJson(relativePath) {
  const content = readText(relativePath);
  if (content === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    failures.push(`${relativePath}: invalid JSON (${error.message})`);
    return undefined;
  }
}

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
  } catch {
    failures.push(`${relativePath}: unable to read file`);
    return undefined;
  }
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}
