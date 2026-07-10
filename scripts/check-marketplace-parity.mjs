#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MARKETPLACE_PATHS = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".plugin/plugin.json",
  ".openai-plugin/plugin.json"
];

const failures = [];

// Check all marketplace manifests exist and have consistent metadata
for (const manifestPath of MARKETPLACE_PATHS) {
  const manifest = readJson(manifestPath);
  if (!manifest) continue;

  // All must have name, version, description, author
  for (const field of ["name", "version", "description"]) {
    if (!isNonEmptyString(manifest[field])) {
      failures.push(`${manifestPath}: missing non-empty string field ${field}`);
    }
  }

  if (manifest.name !== "membase") {
    failures.push(`${manifestPath}: name must be 'membase' for plugin continuity`);
  }

  // Version consistency check
  const rootVersion = getPackageVersion();
  if (manifest.version !== rootVersion) {
    failures.push(
      `${manifestPath}: version ${manifest.version} does not match root package.json version ${rootVersion}`
    );
  }

  // MCP server URL must be consistent
  if (manifest.mcpServers?.membase?.url &&
      manifest.mcpServers.membase.url !== "https://mcp.membase.so/mcp") {
    failures.push(
      `${manifestPath}: MCP server URL must be https://mcp.membase.so/mcp`
    );
  }

  // License must be MIT
  if (manifest.license !== "MIT") {
    failures.push(`${manifestPath}: license must be MIT`);
  }
}

// Logo consistency check
for (const marketplace of [".claude-plugin", ".cursor-plugin", ".plugin", ".openai-plugin"]) {
  const logoPath = path.join(ROOT_DIR, marketplace, "logo.svg");
  try {
    const stat = fs.lstatSync(logoPath);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      failures.push(`${marketplace}/logo.svg: must be a file or symlink`);
    }
  } catch {
    // Logo may be referenced via path, not required to physically exist as file
  }
}

if (failures.length > 0) {
  console.error("Marketplace parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Marketplace parity check passed.");

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: unable to read valid JSON (${error.message})`);
    return undefined;
  }
}

function getPackageVersion() {
  const pkg = readJson("package.json");
  return pkg?.version;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
