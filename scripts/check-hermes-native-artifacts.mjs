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

if (snapshot) {
  assert(snapshot.source?.repo === OLD_REPO, `${SNAPSHOT_PATH}: source.repo must be ${OLD_REPO}`);
  assert(snapshot.source?.treeSha === OLD_TREE_SHA, `${SNAPSHOT_PATH}: source.treeSha is stale or missing`);
  assert(snapshot.policy?.status === "review-only", `${SNAPSHOT_PATH}: policy.status must remain review-only`);
  assert(
    snapshot.policy?.copyRule?.includes("Do not copy old Hermes provider"),
    `${SNAPSHOT_PATH}: policy.copyRule must block premature Hermes runtime artifact copy`
  );

  for (const moduleName of ["capture", "client", "config", "oauth", "wiki_project"]) {
    assert(
      snapshot.policy?.forbiddenRuntimeModulesUntilNativeArtifactsPorted?.includes(moduleName),
      `${SNAPSHOT_PATH}: policy must forbid ${moduleName} until native artifacts are ported`
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

assertHermesProviderStillReviewOnly();
assertDeferredArtifactsNotCopied();
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

function assertHermesProviderStillReviewOnly() {
  const provider = readText("clients/hermes/python/src/hermes_membase/provider.py");
  if (provider === undefined) {
    return;
  }

  for (const marker of [
    "Review-safe Hermes provider boundary",
    "Runtime API calls remain disabled",
    "membase_get_context"
  ]) {
    assert(provider.includes(marker), `clients/hermes/python/src/hermes_membase/provider.py: missing marker ${JSON.stringify(marker)}`);
  }

  assert(
    !provider.includes("membase_search_wiki"),
    "clients/hermes/python/src/hermes_membase/provider.py: wiki-specific old tool is exposed before scope approval"
  );
}

function assertDeferredArtifactsNotCopied() {
  for (const relativePath of [
    "clients/hermes/assets/hermes-membase-banner.png",
    "clients/hermes/python/src/hermes_membase/__main__.py",
    "clients/hermes/python/src/hermes_membase/capture.py",
    "clients/hermes/python/src/hermes_membase/client.py",
    "clients/hermes/python/src/hermes_membase/config.py",
    "clients/hermes/python/src/hermes_membase/current_date.py",
    "clients/hermes/python/src/hermes_membase/format.py",
    "clients/hermes/python/src/hermes_membase/mirror.py",
    "clients/hermes/python/src/hermes_membase/oauth.py",
    "clients/hermes/python/src/hermes_membase/sanitize.py",
    "clients/hermes/python/src/hermes_membase/star_prompt.py",
    "clients/hermes/python/src/hermes_membase/update_check.py",
    "clients/hermes/python/src/hermes_membase/wiki_project.py",
    "clients/hermes/python/tests/test_plugin_cli.py",
    "clients/hermes/python/tests/test_provider_capture.py",
    "clients/hermes/python/tests/test_provider_tools.py"
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
