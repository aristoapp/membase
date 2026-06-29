#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = "clients/claude/native-artifacts.json";
const OLD_REPO = "aristoapp/claude-membase";
const OLD_TREE_SHA = "51c15ab3e05bd4f82847c98dd70f926f9eae4459";

const expectedArtifacts = [
  ["plugin/.claude-plugin/plugin.json", "plugin-metadata", "represented"],
  ["plugin/.mcp.json", "mcp-config", "represented"],
  [".github/workflows/check.yml", "workflow", "represented"],
  ["package.json", "package-metadata", "represented"],
  ["plugin/bin/membase", "command-shim", "deferred-review-only"],
  ["plugin/commands/index-project.md", "claude-command", "deferred-review-only"],
  ["plugin/commands/login.md", "claude-command", "deferred-review-only"],
  ["plugin/commands/logout.md", "claude-command", "deferred-review-only"],
  ["plugin/commands/project-config.md", "claude-command", "deferred-review-only"],
  ["plugin/commands/recall.md", "claude-command", "deferred-review-only"],
  ["plugin/commands/remember.md", "claude-command", "deferred-review-only"],
  ["plugin/commands/status.md", "claude-command", "deferred-review-only"],
  ["plugin/commands/wiki.md", "claude-command", "deferred-review-only"],
  ["plugin/agents/membase-curator.md", "claude-agent", "deferred-review-only"],
  ["plugin/hooks/hooks.json", "claude-hook", "deferred-review-only"],
  ["plugin/scripts/hook.cjs", "runtime-bundle", "deferred-review-only"],
  ["plugin/scripts/mcp-server.cjs", "runtime-bundle", "deferred-review-only"],
  ["plugin/scripts/membase.cjs", "runtime-bundle", "deferred-review-only"],
  ["plugin/skills/memory-hygiene/SKILL.md", "claude-skill", "deferred-review-only"],
  ["plugin/skills/project-context/SKILL.md", "claude-skill", "deferred-review-only"],
  ["plugin/skills/recall/SKILL.md", "claude-skill", "deferred-review-only"],
  ["plugin/skills/remember/SKILL.md", "claude-skill", "deferred-review-only"],
  ["plugin/skills/wiki/SKILL.md", "claude-skill", "deferred-review-only"],
  ["src/hooks/session-start.ts", "source-behavior", "deferred-review-only"],
  ["tests/session-start.test.ts", "test-evidence", "deferred-review-only"]
];

const requiredDocMarkers = [
  {
    path: "docs/packaging-action-parity.md",
    markers: ["pnpm claude:native-artifacts", SNAPSHOT_PATH, "plugin/commands/login.md"]
  },
  {
    path: "docs/migration-parity.md",
    markers: [SNAPSHOT_PATH, "Claude native artifact snapshot"]
  },
  {
    path: "docs/test-coverage-parity.md",
    markers: ["pnpm claude:native-artifacts", "Claude native artifact snapshot"]
  },
  {
    path: "docs/review-summary.md",
    markers: ["pnpm claude:native-artifacts", "Claude native artifact snapshot"]
  },
  {
    path: "docs/runtime-parity-decisions.md",
    markers: [SNAPSHOT_PATH, "Claude native artifact snapshot"]
  },
  {
    path: "clients/claude/README.md",
    markers: [SNAPSHOT_PATH, "pnpm claude:native-artifacts"]
  },
  {
    path: "docs/install/claude.md",
    markers: [SNAPSHOT_PATH, "pnpm claude:native-artifacts"]
  }
];

const failures = [];
const snapshot = readJson(SNAPSHOT_PATH);

if (snapshot) {
  assert(snapshot.source?.repo === OLD_REPO, `${SNAPSHOT_PATH}: source.repo must be ${OLD_REPO}`);
  assert(snapshot.source?.treeSha === OLD_TREE_SHA, `${SNAPSHOT_PATH}: source.treeSha is stale or missing`);
  assert(snapshot.policy?.status === "review-only", `${SNAPSHOT_PATH}: policy.status must remain review-only`);
  assert(
    snapshot.policy?.copyRule?.includes("Do not copy old Claude commands"),
    `${SNAPSHOT_PATH}: policy.copyRule must block premature Claude artifact copy`
  );

  for (const field of ["commands", "hooks", "skills", "agents"]) {
    assert(
      snapshot.policy?.forbiddenManifestFieldsUntilNativeArtifactsPorted?.includes(field),
      `${SNAPSHOT_PATH}: policy must forbid ${field} until native artifacts are ported`
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

assertClaudeMetadataStillNativeFree();
assertDeferredArtifactsNotCopied();
assertDocs();
assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("Claude native artifact snapshot check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Claude native artifact snapshot check passed.");

function assertClaudeMetadataStillNativeFree() {
  for (const manifestPath of ["clients/claude/.claude-plugin/plugin.json", "manifests/claude/plugin.json"]) {
    const manifest = readJson(manifestPath);
    if (!manifest) {
      continue;
    }

    for (const field of ["commands", "hooks", "skills", "agents"]) {
      assert(!Object.prototype.hasOwnProperty.call(manifest, field), `${manifestPath}: ${field} must stay omitted until native artifacts are ported`);
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
    "clients/claude/bin/membase",
    "clients/claude/commands/index-project.md",
    "clients/claude/commands/login.md",
    "clients/claude/commands/logout.md",
    "clients/claude/commands/project-config.md",
    "clients/claude/commands/recall.md",
    "clients/claude/commands/remember.md",
    "clients/claude/commands/status.md",
    "clients/claude/commands/wiki.md",
    "clients/claude/agents/membase-curator.md",
    "clients/claude/hooks/hooks.json",
    "clients/claude/scripts/hook.cjs",
    "clients/claude/scripts/mcp-server.cjs",
    "clients/claude/scripts/membase.cjs",
    "clients/claude/skills/memory-hygiene/SKILL.md",
    "clients/claude/skills/project-context/SKILL.md",
    "clients/claude/skills/recall/SKILL.md",
    "clients/claude/skills/remember/SKILL.md",
    "clients/claude/skills/wiki/SKILL.md"
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
  const nativeArtifactScript = packageJson?.scripts?.["claude:native-artifacts"];
  assert(
    nativeArtifactScript === "node scripts/check-claude-native-artifacts.mjs",
    "package.json: scripts.claude:native-artifacts is missing or unexpected"
  );

  const checkScript = packageJson?.scripts?.check;
  assert(
    typeof checkScript === "string" && checkScript.includes("claude:native-artifacts"),
    "package.json: scripts.check does not include claude:native-artifacts"
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
