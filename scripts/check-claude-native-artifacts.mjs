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
  ["plugin/bin/membase", "command-shim", "ported"],
  ["plugin/commands/index-project.md", "claude-command", "ported"],
  ["plugin/commands/login.md", "claude-command", "ported"],
  ["plugin/commands/logout.md", "claude-command", "ported"],
  ["plugin/commands/project-config.md", "claude-command", "ported"],
  ["plugin/commands/recall.md", "claude-command", "ported"],
  ["plugin/commands/remember.md", "claude-command", "ported"],
  ["plugin/commands/status.md", "claude-command", "ported"],
  ["plugin/commands/wiki.md", "claude-command", "ported"],
  ["plugin/agents/membase-curator.md", "claude-agent", "ported"],
  ["plugin/hooks/hooks.json", "claude-hook", "ported"],
  ["plugin/scripts/hook.cjs", "runtime-bundle", "ported"],
  ["plugin/scripts/mcp-server.cjs", "runtime-bundle", "ported"],
  ["plugin/scripts/membase.cjs", "runtime-bundle", "ported"],
  ["plugin/skills/memory-hygiene/SKILL.md", "claude-skill", "ported"],
  ["plugin/skills/project-context/SKILL.md", "claude-skill", "ported"],
  ["plugin/skills/recall/SKILL.md", "claude-skill", "ported"],
  ["plugin/skills/remember/SKILL.md", "claude-skill", "ported"],
  ["plugin/skills/wiki/SKILL.md", "claude-skill", "ported"],
  ["src/hooks/session-start.ts", "source-behavior", "ported"],
  ["tests/session-start.test.ts", "test-evidence", "ported"]
];

const failures = [];
const snapshot = readJson(SNAPSHOT_PATH);

if (snapshot) {
  assert(snapshot.source?.repo === OLD_REPO, `${SNAPSHOT_PATH}: source.repo must be ${OLD_REPO}`);
  assert(snapshot.source?.treeSha === OLD_TREE_SHA, `${SNAPSHOT_PATH}: source.treeSha is stale or missing`);
  assert(snapshot.policy?.status === "ported", `${SNAPSHOT_PATH}: policy.status must be ported (consolidation Group C)`);
  assert(
    snapshot.policy?.copyRule?.includes("copied in as-is"),
    `${SNAPSHOT_PATH}: policy.copyRule must record the as-is copy-in decision`
  );

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
    assert(!Object.hasOwn(artifact, "content"), `${SNAPSHOT_PATH}: ${artifactPath} must not inline old file content`);
  }
}

assertClaudeMetadataStillNativeFree();
assertRuntimePortedIn();
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

    // The ADAPTER manifest stays capability-level by design; the copied-in
    // runtime bundle carries its own native manifest with commands/hooks/skills
    // at clients/claude/runtime/plugin/.claude-plugin/plugin.json.
    for (const field of ["commands", "hooks", "skills", "agents"]) {
      assert(!Object.hasOwn(manifest, field), `${manifestPath}: ${field} belongs to the runtime bundle manifest, not the adapter manifest`);
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

// The full standalone runtime now lives at clients/claude/runtime (consolidation
// Group C, pure copy-in). Every inventory entry marked "ported" must exist there
// — derived from expectedArtifacts so the two lists cannot drift.
function assertRuntimePortedIn() {
  for (const [artifactPath, , status] of expectedArtifacts) {
    if (status !== "ported") {
      continue;
    }
    assert(
      fs.existsSync(path.join(ROOT_DIR, "clients/claude/runtime", artifactPath)),
      `clients/claude/runtime/${artifactPath}: ported artifact missing after copy-in`
    );
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
