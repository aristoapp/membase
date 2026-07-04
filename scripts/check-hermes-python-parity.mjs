#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_PACKAGE_PATH = "clients/hermes/package.json";
const PYTHON_ROOT = "clients/hermes/python";
const PYPROJECT_PATH = `${PYTHON_ROOT}/pyproject.toml`;
const PYTHON_SRC_DIR = `${PYTHON_ROOT}/src/membase_hermes`;
const NATIVE_MANIFEST_PATH = "clients/hermes/plugin/plugin.yaml";
const PACKAGE_MANIFEST_PATH = `${PYTHON_SRC_DIR}/plugin/plugin.yaml`;

const requiredFiles = [
  `${PYTHON_ROOT}/README.md`,
  PYPROJECT_PATH,
  `${PYTHON_SRC_DIR}/__init__.py`,
  `${PYTHON_SRC_DIR}/cli.py`,
  `${PYTHON_SRC_DIR}/installer.py`,
  `${PYTHON_SRC_DIR}/provider.py`,
  `${PYTHON_SRC_DIR}/plugin/__init__.py`,
  `${PYTHON_SRC_DIR}/plugin/cli.py`,
  PACKAGE_MANIFEST_PATH
];

const failures = [];

for (const file of requiredFiles) {
  assertFileExists(file);
}

const clientPackage = readJson(CLIENT_PACKAGE_PATH);
if (clientPackage) {
  assert(
    clientPackage.name === "@membase/client-hermes",
    `${CLIENT_PACKAGE_PATH}: unexpected package name`
  );
  assert(clientPackage.private === true, `${CLIENT_PACKAGE_PATH}: package must stay private`);
  assertNoPublishingScripts(CLIENT_PACKAGE_PATH, clientPackage.scripts ?? {});
}

const pyproject = readText(PYPROJECT_PATH);
if (pyproject !== undefined) {
  assertMarkers(PYPROJECT_PATH, pyproject, [
    'name = "hermes-membase"',
    'requires-python = ">=3.11"',
    'hermes-membase = "membase_hermes.cli:main"',
    'hermes-membase-install = "membase_hermes.installer:main"',
    'membase_hermes = ["plugin/*.yaml"]'
  ]);
  assertNoPublishingText(PYPROJECT_PATH, pyproject);
  runPythonTomlCheck();
}

assertSyncedNativeManifest();

if (failures.length === 0) {
  runPythonSyntaxCheck();
  assertRuntimePresent();
}

if (failures.length > 0) {
  console.error("Hermes Python parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Hermes Python parity check passed.");

function runPythonTomlCheck() {
  run("python3", [
    "-c",
    [
      "import pathlib, sys, tomllib",
      "data = tomllib.loads(pathlib.Path(sys.argv[1]).read_text())",
      "project = data['project']",
      "scripts = project['scripts']",
      "assert project['name'] == 'hermes-membase'",
      "assert project['requires-python'] == '>=3.11'",
      "assert scripts['hermes-membase'] == 'membase_hermes.cli:main'",
      "assert scripts['hermes-membase-install'] == 'membase_hermes.installer:main'",
      "package_data = data['tool']['setuptools']['package-data']",
      "assert 'plugin/*.yaml' in package_data['membase_hermes']"
    ].join("; "),
    path.join(ROOT_DIR, PYPROJECT_PATH)
  ]);
}

function runPythonSyntaxCheck() {
  run("python3", [
    "-c",
    [
      "import ast, pathlib, sys",
      "root = pathlib.Path(sys.argv[1])",
      "files = sorted(root.rglob('*.py'))",
      "assert files, 'no Python files found'",
      "[ast.parse(path.read_text(), filename=str(path)) for path in files]"
    ].join("; "),
    path.join(ROOT_DIR, PYTHON_SRC_DIR)
  ]);
}

// The real Hermes provider runtime has been copied into the repo (consolidation
// Group B, pure copy-in). This validates the runtime is PRESENT and exposes its
// public connector surface, by source inspection only — it does NOT import the
// modules (that would require the runtime's third-party deps, e.g. httpx, in CI).
// Live behavior is covered by the e2e tiers.
function assertRuntimePresent() {
  const provider = readText(`${PYTHON_SRC_DIR}/provider.py`);
  if (provider !== undefined) {
    assertMarkers(`${PYTHON_SRC_DIR}/provider.py`, provider, [
      "class MembaseMemoryProvider",
      '"membase_search"',
      '"membase_store"',
      '"membase_forget"'
    ]);
  }

  const pluginInit = readText(`${PYTHON_SRC_DIR}/plugin/__init__.py`);
  if (pluginInit !== undefined) {
    assertMarkers(`${PYTHON_SRC_DIR}/plugin/__init__.py`, pluginInit, ["def register("]);
  }

  // The disabled "review scaffold" runtime must be gone (real client present).
  const client = readText(`${PYTHON_SRC_DIR}/client.py`);
  if (client === undefined) {
    failures.push(`${PYTHON_SRC_DIR}/client.py: runtime client is missing after copy-in`);
  }
}

function assertSyncedNativeManifest() {
  const nativeManifest = readText(NATIVE_MANIFEST_PATH);
  const packageManifest = readText(PACKAGE_MANIFEST_PATH);

  if (nativeManifest === undefined || packageManifest === undefined) {
    return;
  }

  if (nativeManifest.trim() !== packageManifest.trim()) {
    failures.push(`${PACKAGE_MANIFEST_PATH}: must match ${NATIVE_MANIFEST_PATH}`);
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: unable to read JSON (${error.message})`);
    return undefined;
  }
}

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
  } catch (error) {
    failures.push(`${relativePath}: unable to read file (${error.message})`);
    return undefined;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    failures.push(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function assertFileExists(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    failures.push(`${relativePath}: expected file is missing`);
  }
}

function assertMarkers(relativePath, content, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) {
      failures.push(`${relativePath}: missing marker ${JSON.stringify(marker)}`);
    }
  }
}

function assertNoPublishingScripts(relativePath, scripts) {
  for (const [name, command] of Object.entries(scripts)) {
    if (/publish/i.test(name) || /\b(?:npm|pnpm|bun)\s+publish\b/i.test(command)) {
      failures.push(`${relativePath}: publishing script ${JSON.stringify(name)} is not allowed`);
    }
  }
}

function assertNoPublishingText(relativePath, content) {
  const forbiddenPatterns = [
    /\btwine\b/i,
    /\bupload\b/i,
    /\bpublish(?:ing)?\s+enabled\b/i
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      failures.push(`${relativePath}: contains forbidden publishing marker ${pattern.source}`);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}
