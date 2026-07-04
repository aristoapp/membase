#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = "clients/hermes/native-artifacts.json";
const OLD_REPO = "aristoapp/hermes-membase";
const OLD_TREE_SHA = "70d5d8951cf417dce0cebf159abaae330defde96";

const expectedArtifacts = [
  ["pyproject.toml", "package-metadata", "represented"],
  [".github/workflows/publish.yml", "publish-workflow", "represented"],
  ["ci/pypi-publish.yml", "publish-workflow", "represented"],
  ["Makefile", "packaging-command", "deferred-review-only"],
  ["hermes-membase-banner.png", "asset", "deferred-review-only"],
  ["src/membase_hermes/plugin/plugin.yaml", "plugin-metadata", "represented"],
  ["src/membase_hermes/plugin/__init__.py", "plugin-register", "represented"],
  ["src/membase_hermes/plugin/cli.py", "plugin-cli", "represented"],
  ["src/membase_hermes/__init__.py", "python-package", "represented"],
  ["src/membase_hermes/__main__.py", "python-cli", "deferred-review-only"],
  ["src/membase_hermes/cli.py", "python-cli", "deferred-review-only"],
  ["src/membase_hermes/installer.py", "installer", "deferred-review-only"],
  ["src/membase_hermes/provider.py", "provider-runtime", "deferred-review-only"],
  ["src/membase_hermes/capture.py", "capture-runtime", "deferred-review-only"],
  ["src/membase_hermes/client.py", "runtime-client", "deferred-review-only"],
  ["src/membase_hermes/config.py", "native-config", "deferred-review-only"],
  ["src/membase_hermes/current_date.py", "utility", "deferred-review-only"],
  ["src/membase_hermes/format.py", "display-formatting", "deferred-review-only"],
  ["src/membase_hermes/mirror.py", "mirror-runtime", "deferred-review-only"],
  ["src/membase_hermes/oauth.py", "oauth-runtime", "deferred-review-only"],
  ["src/membase_hermes/sanitize.py", "content-safety", "deferred-review-only"],
  ["src/membase_hermes/star_prompt.py", "launch-prompt", "deferred-review-only"],
  ["src/membase_hermes/update_check.py", "update-check", "deferred-review-only"],
  ["src/membase_hermes/wiki_project.py", "wiki-project", "deferred-review-only"],
  ["tests/test_plugin_cli.py", "test-evidence", "deferred-review-only"],
  ["tests/test_provider_capture.py", "test-evidence", "deferred-review-only"],
  ["tests/test_provider_tools.py", "test-evidence", "deferred-review-only"]
];

const requiredDocMarkers = [
  {
    path: "docs/packaging-action-parity.md",
    markers: ["pnpm hermes:native-artifacts", SNAPSHOT_PATH, "src/membase_hermes/capture.py"]
  },
  {
    path: "docs/migration-parity.md",
    markers: [SNAPSHOT_PATH, "Hermes native artifact snapshot"]
  },
  {
    path: "docs/test-coverage-parity.md",
    markers: ["pnpm hermes:native-artifacts", "Hermes native artifact snapshot"]
  },
  {
    path: "docs/review-summary.md",
    markers: ["pnpm hermes:native-artifacts", "Hermes native artifact snapshot"]
  },
  {
    path: "docs/runtime-parity-decisions.md",
    markers: [SNAPSHOT_PATH, "Hermes native artifact snapshot"]
  },
  {
    path: "clients/hermes/README.md",
    markers: [SNAPSHOT_PATH, "pnpm hermes:native-artifacts"]
  },
  {
    path: "docs/install/hermes.md",
    markers: [SNAPSHOT_PATH, "pnpm hermes:native-artifacts"]
  }
];

const failures = [];
const snapshot = readJson(SNAPSHOT_PATH);

// The Hermes runtime has been copied in (consolidation Group B, pure copy-in),
// so this snapshot is now a historical inventory of the ported source, not a
// "not yet copied" guard. Validate provenance + that the recorded policy
// reflects the ported state; the per-artifact absence checks are gone.
if (snapshot) {
  assert(snapshot.source?.repo === OLD_REPO, `${SNAPSHOT_PATH}: source.repo must be ${OLD_REPO}`);
  assert(snapshot.source?.treeSha === OLD_TREE_SHA, `${SNAPSHOT_PATH}: source.treeSha is stale or missing`);
  assert(snapshot.policy?.status === "ported", `${SNAPSHOT_PATH}: policy.status must be "ported" after copy-in`);

  const artifacts = Array.isArray(snapshot.artifacts) ? snapshot.artifacts : [];
  assert(artifacts.length === expectedArtifacts.length, `${SNAPSHOT_PATH}: expected ${expectedArtifacts.length} artifacts`);
  for (const [artifactPath] of expectedArtifacts) {
    const artifact = artifacts.find((item) => item.path === artifactPath);
    assert(Boolean(artifact), `${SNAPSHOT_PATH}: missing artifact ${artifactPath}`);
    if (artifact) {
      assert(!Object.prototype.hasOwnProperty.call(artifact, "content"), `${SNAPSHOT_PATH}: ${artifactPath} must not inline old file content`);
    }
  }
}

assertRuntimePortedIn();
assertDocs();
assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("Hermes native artifact snapshot check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Hermes native artifact snapshot check passed.");

// After copy-in, assert the real runtime IS present (the inverse of the old
// "not copied yet" guard). Source inspection only — no import (avoids needing
// the runtime's third-party deps in CI); live behavior is covered by e2e.
function assertRuntimePortedIn() {
  const base = "clients/hermes/python/src/membase_hermes";
  for (const relativePath of [
    `${base}/provider.py`,
    `${base}/client.py`,
    `${base}/config.py`,
    `${base}/oauth.py`,
    `${base}/capture.py`,
    `${base}/mirror.py`
  ]) {
    assert(fs.existsSync(path.join(ROOT_DIR, relativePath)), `${relativePath}: runtime module missing after copy-in`);
  }

  const provider = readText(`${base}/provider.py`);
  if (provider !== undefined) {
    assert(
      provider.includes("class MembaseMemoryProvider"),
      `${base}/provider.py: real MembaseMemoryProvider not present`
    );
    assert(
      !provider.includes("Runtime API calls remain disabled"),
      `${base}/provider.py: still the disabled review scaffold, not the real runtime`
    );
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
  const nativeArtifactScript = packageJson?.scripts?.["hermes:native-artifacts"];
  assert(
    nativeArtifactScript === "node scripts/check-hermes-native-artifacts.mjs",
    "package.json: scripts.hermes:native-artifacts is missing or unexpected"
  );

  const checkScript = packageJson?.scripts?.check;
  assert(
    typeof checkScript === "string" && checkScript.includes("hermes:native-artifacts"),
    "package.json: scripts.check does not include hermes:native-artifacts"
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
