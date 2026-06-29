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

const requiredDocMarkers = [
  {
    path: "docs/packaging-action-parity.md",
    markers: ["pnpm openclaw:native-artifacts", SNAPSHOT_PATH, "src/commands/cli.ts"]
  },
  {
    path: "docs/migration-parity.md",
    markers: [SNAPSHOT_PATH, "OpenClaw native artifact snapshot"]
  },
  {
    path: "docs/test-coverage-parity.md",
    markers: ["pnpm openclaw:native-artifacts", "OpenClaw native artifact snapshot"]
  },
  {
    path: "docs/review-summary.md",
    markers: ["pnpm openclaw:native-artifacts", "OpenClaw native artifact snapshot"]
  },
  {
    path: "docs/runtime-parity-decisions.md",
    markers: [SNAPSHOT_PATH, "OpenClaw native artifact snapshot"]
  },
  {
    path: "clients/openclaw/README.md",
    markers: [SNAPSHOT_PATH, "pnpm openclaw:native-artifacts"]
  },
  {
    path: "docs/install/openclaw.md",
    markers: [SNAPSHOT_PATH, "pnpm openclaw:native-artifacts"]
  }
];

const failures = [];
const snapshot = readJson(SNAPSHOT_PATH);

if (snapshot) {
  assert(snapshot.source?.repo === OLD_REPO, `${SNAPSHOT_PATH}: source.repo must be ${OLD_REPO}`);
  assert(snapshot.source?.treeSha === OLD_TREE_SHA, `${SNAPSHOT_PATH}: source.treeSha is stale or missing`);
  assert(snapshot.policy?.status === "review-only", `${SNAPSHOT_PATH}: policy.status must remain review-only`);
  assert(
    snapshot.policy?.copyRule?.includes("Do not copy old OpenClaw commands"),
    `${SNAPSHOT_PATH}: policy.copyRule must block premature OpenClaw artifact copy`
  );

  for (const directory of ["commands", "hooks", "tools", "skills"]) {
    assert(
      snapshot.policy?.forbiddenRuntimeDirectoriesUntilNativeArtifactsPorted?.includes(directory),
      `${SNAPSHOT_PATH}: policy must forbid ${directory} until native artifacts are ported`
    );
  }

  const artifacts = Array.isArray(snapshot.artifacts) ? snapshot.artifacts : [];
  assert(artifacts.length === expectedArtifacts.length, `${SNAPSHOT_PATH}: expected ${expectedArtifacts.length} artifacts`);

  for (const [artifactPath, kind, status] of expectedArtifacts) {
    const artifact = artifacts.find((item) => item.path === artifactPath);
    assert(Boolean(artifact), `${SNAPSHOT_PATH}: missing artifact ${artifactPath}`);
    if (!artifact) {
      continue;
    }

    assert(artifact.kind === kind, `${SNAPSHOT_PATH}: ${artifactPath} expected kind ${kind}`);
    assert(artifact.status === status, `${SNAPSHOT_PATH}: ${artifactPath} expected status ${status}`);
    assert(typeof artifact.sha === "string" && artifact.sha.length === 40, `${SNAPSHOT_PATH}: ${artifactPath} missing git blob sha`);
    assert(Number.isInteger(artifact.size) && artifact.size > 0, `${SNAPSHOT_PATH}: ${artifactPath} missing size`);
    assert(!Object.prototype.hasOwnProperty.call(artifact, "content"), `${SNAPSHOT_PATH}: ${artifactPath} must not inline old file content`);
  }
}

assertOpenClawMetadataStillRuntimeFree();
assertDeferredArtifactsNotCopied();
assertDocs();
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
      assert(!Object.prototype.hasOwnProperty.call(manifest, field), `${manifestPath}: ${field} must stay omitted until native artifacts are ported`);
    }

    assert(
      Array.isArray(manifest.skills) && manifest.skills.length === 1 && manifest.skills[0] === "skills",
      `${manifestPath}: skills directory declaration should remain metadata-only until skills are ported`
    );
  }
}

function assertDeferredArtifactsNotCopied() {
  for (const relativePath of [
    "clients/openclaw/src/client.ts",
    "clients/openclaw/src/config.ts",
    "clients/openclaw/src/commands/cli.ts",
    "clients/openclaw/src/hooks/capture.ts",
    "clients/openclaw/src/hooks/recall.ts",
    "clients/openclaw/src/tools/add-wiki.ts",
    "clients/openclaw/src/tools/current-date.ts",
    "clients/openclaw/src/tools/delete-wiki.ts",
    "clients/openclaw/src/tools/forget.ts",
    "clients/openclaw/src/tools/profile.ts",
    "clients/openclaw/src/tools/search-wiki.ts",
    "clients/openclaw/src/tools/search.ts",
    "clients/openclaw/src/tools/store.ts",
    "clients/openclaw/src/tools/update-wiki.ts",
    "clients/openclaw/src/format.ts",
    "clients/openclaw/src/star-prompt.ts",
    "clients/openclaw/src/update-check.ts",
    "clients/openclaw/src/wiki-project.ts",
    "clients/openclaw/src/membase-tools.test.ts",
    "clients/openclaw/src/star-prompt.test.ts",
    "clients/openclaw/src/update-check.test.ts",
    "clients/openclaw/skills"
  ]) {
    assert(!fs.existsSync(path.join(ROOT_DIR, relativePath)), `${relativePath}: copied before review-only snapshot status was changed`);
  }
}

function assertDocs() {
  for (const doc of requiredDocMarkers) {
    const content = readText(doc.path);
    if (content === undefined) {
      continue;
    }

    for (const marker of doc.markers) {
      assert(content.includes(marker), `${doc.path}: missing marker ${JSON.stringify(marker)}`);
    }
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
