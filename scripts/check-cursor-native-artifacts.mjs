#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = "clients/cursor/native-artifacts.json";
const OLD_REPO = "aristoapp/cursor-membase";
const OLD_TREE_SHA = "177d29c78b2f4698ead9d5108eedeae5b6b059b7";

const expectedArtifacts = [
  [".cursor-plugin/plugin.json", "plugin-metadata", "represented"],
  ["mcp.json", "mcp-config", "represented"],
  ["rules/membase.mdc", "cursor-rule", "deferred-review-only"],
  ["skills/membase-overview/SKILL.md", "cursor-skill", "deferred-review-only"],
  ["skills/memory-save/SKILL.md", "cursor-skill", "deferred-review-only"],
  ["skills/memory-search/SKILL.md", "cursor-skill", "deferred-review-only"],
  ["skills/wiki-manage/SKILL.md", "cursor-skill", "deferred-review-only"],
  ["assets/logo.svg", "asset", "deferred-review-only"],
  ["CHANGELOG.md", "changelog", "deferred-review-only"]
];

const requiredDocMarkers = [
  {
    path: "docs/packaging-action-parity.md",
    markers: ["pnpm cursor:native-artifacts", SNAPSHOT_PATH, "rules/membase.mdc"]
  },
  {
    path: "docs/migration-parity.md",
    markers: ["clients/cursor/native-artifacts.json", "Cursor native artifact snapshot"]
  },
  {
    path: "docs/test-coverage-parity.md",
    markers: ["pnpm cursor:native-artifacts", "snapshot-only"]
  },
  {
    path: "docs/review-summary.md",
    markers: ["pnpm cursor:native-artifacts", "Cursor native artifact snapshot"]
  },
  {
    path: "clients/cursor/README.md",
    markers: [SNAPSHOT_PATH, "pnpm cursor:native-artifacts"]
  }
];

const failures = [];
const snapshot = readJson(SNAPSHOT_PATH);

if (snapshot) {
  assert(snapshot.source?.repo === OLD_REPO, `${SNAPSHOT_PATH}: source.repo must be ${OLD_REPO}`);
  assert(snapshot.source?.treeSha === OLD_TREE_SHA, `${SNAPSHOT_PATH}: source.treeSha is stale or missing`);
  assert(snapshot.policy?.status === "review-only", `${SNAPSHOT_PATH}: policy.status must remain review-only`);
  assert(
    snapshot.policy?.copyRule?.includes("Do not copy old Cursor rules"),
    `${SNAPSHOT_PATH}: policy.copyRule must block premature Cursor artifact copy`
  );

  for (const field of ["logo", "icon"]) {
    assert(
      snapshot.policy?.forbiddenManifestFieldsUntilAssetsPorted?.includes(field),
      `${SNAPSHOT_PATH}: policy must forbid ${field} until assets are ported`
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

assertCursorMetadataStillAssetFree();
assertDeferredArtifactsNotCopied();
assertDocs();
assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("Cursor native artifact snapshot check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Cursor native artifact snapshot check passed.");

function assertCursorMetadataStillAssetFree() {
  for (const manifestPath of ["clients/cursor/.cursor-plugin/plugin.json", "manifests/cursor/plugin.json"]) {
    const manifest = readJson(manifestPath);
    if (!manifest) {
      continue;
    }

    for (const field of ["logo", "icon"]) {
      assert(!Object.prototype.hasOwnProperty.call(manifest, field), `${manifestPath}: ${field} must stay omitted until asset is copied and approved`);
    }

    assert(
      typeof manifest.description === "string" &&
        manifest.description.includes("remember") &&
        manifest.description.includes("search") &&
        manifest.description.includes("task context") &&
        manifest.description.includes("forget"),
      `${manifestPath}: description must stay at connector-capability boundary`
    );
  }
}

function assertDeferredArtifactsNotCopied() {
  for (const relativePath of [
    "clients/cursor/rules/membase.mdc",
    "clients/cursor/skills/membase-overview/SKILL.md",
    "clients/cursor/skills/memory-save/SKILL.md",
    "clients/cursor/skills/memory-search/SKILL.md",
    "clients/cursor/skills/wiki-manage/SKILL.md",
    "clients/cursor/assets/logo.svg",
    "clients/cursor/CHANGELOG.md"
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
  const nativeArtifactScript = packageJson?.scripts?.["cursor:native-artifacts"];
  assert(
    nativeArtifactScript === "node scripts/check-cursor-native-artifacts.mjs",
    "package.json: scripts.cursor:native-artifacts is missing or unexpected"
  );

  const checkScript = packageJson?.scripts?.check;
  assert(
    typeof checkScript === "string" && checkScript.includes("cursor:native-artifacts"),
    "package.json: scripts.check does not include cursor:native-artifacts"
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
