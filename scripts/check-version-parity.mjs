#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// clients/openclaw/runtime and packages/capture-core are deliberately absent:
// they follow their published npm lineages (@membase/openclaw-membase,
// @membase/capture-core), not the monorepo version.
const npmPackagePaths = [
  "package.json",
  "packages/core/package.json",
  "packages/connector-sdk/package.json",
  "packages/stdio-runtime/package.json",
  "clients/claude/package.json",
  "clients/codex/package.json",
  "clients/cursor/package.json",
  "clients/hermes/package.json",
  "clients/openclaw/package.json"
];

const pluginJsonVersionPaths = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".plugin/plugin.json",
  ".openai-plugin/plugin.json"
];

const hermesYamlVersionPaths = [
  "clients/hermes/plugin/plugin.yaml",
  "clients/hermes/python/src/membase_hermes/plugin/plugin.yaml",
  "manifests/hermes/plugin.yaml"
];

const failures = [];
const rootPackage = readJson("package.json");
const expectedVersion = rootPackage?.version;

if (typeof expectedVersion !== "string" || expectedVersion.length === 0) {
  failures.push("package.json: version must be a non-empty string");
}

if (expectedVersion !== undefined) {
  for (const packagePath of npmPackagePaths) {
    const packageJson = readJson(packagePath);
    if (packageJson !== undefined) {
      assertVersion(packagePath, packageJson.version, expectedVersion);
    }
  }

  for (const manifestPath of pluginJsonVersionPaths) {
    const manifest = readJson(manifestPath);
    if (manifest !== undefined) {
      assertVersion(manifestPath, manifest.version, expectedVersion);
    }
  }

  for (const manifestPath of hermesYamlVersionPaths) {
    const content = readText(manifestPath);
    if (content !== undefined) {
      assertVersion(manifestPath, readYamlScalar(content, "version"), expectedVersion);
    }
  }

  const pyprojectText = readText("clients/hermes/python/pyproject.toml");
  if (pyprojectText !== undefined) {
    assertVersion(
      "clients/hermes/python/pyproject.toml",
      readTomlString(pyprojectText, "version"),
      expectedVersion
    );
  }

  const hermesInitText = readText("clients/hermes/python/src/membase_hermes/__init__.py");
  if (hermesInitText !== undefined) {
    assertVersion(
      "clients/hermes/python/src/membase_hermes/__init__.py",
      readPythonAssignment(hermesInitText, "__version__"),
      expectedVersion
    );
  }

  assertNoUnexpectedVersionFields("clients/openclaw/openclaw.plugin.json");
  assertNoUnexpectedVersionFields("manifests/openclaw/plugin.json");

  // The bundled stdio server reports this in serverInfo/source_metadata; it
  // drifted to a stale value once (0.1.5 while the repo shipped 0.1.6).
  const constantsText = readText("packages/stdio-runtime/src/constants.ts");
  if (constantsText !== undefined) {
    const match = constantsText.match(/^export const PLUGIN_VERSION = "([^"]+)";$/m);
    assertVersion(
      "packages/stdio-runtime/src/constants.ts (PLUGIN_VERSION)",
      match?.[1],
      expectedVersion
    );
  }
}

if (failures.length > 0) {
  console.error("Version parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Version parity check passed (${expectedVersion}).`);

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
  } catch (error) {
    failures.push(`${relativePath}: unable to read file (${error.message})`);
    return undefined;
  }
}

function readYamlScalar(content, key) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m");
  const match = content.match(pattern);
  if (!match) {
    return undefined;
  }

  return match[1].replace(/^["']|["']$/g, "");
}

function readTomlString(content, key) {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']\\s*$`, "m");
  return content.match(pattern)?.[1];
}

function readPythonAssignment(content, key) {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*["']([^"']+)["']\\s*$`, "m");
  return content.match(pattern)?.[1];
}

function assertNoUnexpectedVersionFields(relativePath) {
  const manifest = readJson(relativePath);
  if (manifest !== undefined && Object.hasOwn(manifest, "version")) {
    failures.push(
      `${relativePath}: the OpenClaw manifest intentionally carries no version field — the package.json is the version source`
    );
  }
}

function assertVersion(relativePath, actualVersion, expectedVersion) {
  if (actualVersion !== expectedVersion) {
    failures.push(
      `${relativePath}: expected version ${JSON.stringify(expectedVersion)}, found ${JSON.stringify(actualVersion)}`
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
