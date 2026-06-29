#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = "clients/claude";
const CLIENT_PLUGIN_PATH = `${CLIENT_DIR}/.claude-plugin/plugin.json`;
const CLIENT_MCP_PATH = `${CLIENT_DIR}/.mcp.json`;
const MANIFEST_PLUGIN_PATH = "manifests/claude/plugin.json";
const MANIFEST_MCP_PATH = "manifests/claude/mcp.json";
const CLIENT_PACKAGE_PATH = `${CLIENT_DIR}/package.json`;

const failures = [];

const clientPlugin = readJson(CLIENT_PLUGIN_PATH);
const clientMcpConfig = readJson(CLIENT_MCP_PATH);
const manifestPlugin = readJson(MANIFEST_PLUGIN_PATH);
const mcpConfig = readJson(MANIFEST_MCP_PATH);
const clientPackage = readJson(CLIENT_PACKAGE_PATH);

if (clientPlugin && manifestPlugin) {
  assertJsonEqual(CLIENT_PLUGIN_PATH, clientPlugin, MANIFEST_PLUGIN_PATH, manifestPlugin);
  assertClaudePluginManifest(clientPlugin);
}

if (clientPlugin && clientPackage && clientPlugin.version !== clientPackage.version) {
  failures.push(
    `${CLIENT_PLUGIN_PATH}: version ${clientPlugin.version} does not match ${CLIENT_PACKAGE_PATH} version ${clientPackage.version}`
  );
}

if (mcpConfig) {
  assertClaudeMcpConfig(mcpConfig);
}

if (clientMcpConfig && mcpConfig) {
  assertJsonEqual(CLIENT_MCP_PATH, clientMcpConfig, MANIFEST_MCP_PATH, mcpConfig);
}

runClaudePluginValidation();

if (failures.length > 0) {
  console.error("Claude plugin parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Claude plugin parity check passed.");

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: unable to read valid JSON (${error.message})`);
    return undefined;
  }
}

function assertJsonEqual(leftPath, left, rightPath, right) {
  const leftText = JSON.stringify(left);
  const rightText = JSON.stringify(right);
  if (leftText !== rightText) {
    failures.push(`${leftPath}: does not match ${rightPath}`);
  }
}

function assertClaudePluginManifest(manifest) {
  for (const field of ["name", "description", "version", "homepage", "repository", "license"]) {
    if (!isNonEmptyString(manifest[field])) {
      failures.push(`${CLIENT_PLUGIN_PATH}: missing non-empty string field ${field}`);
    }
  }

  if (!manifest.author || !isNonEmptyString(manifest.author.name)) {
    failures.push(`${CLIENT_PLUGIN_PATH}: missing author.name`);
  }

  if (!Array.isArray(manifest.keywords) || manifest.keywords.length === 0) {
    failures.push(`${CLIENT_PLUGIN_PATH}: keywords must be a non-empty array`);
  }

  if (manifest.name !== "membase") {
    failures.push(`${CLIENT_PLUGIN_PATH}: name must remain membase for Claude plugin continuity`);
  }

  const description = String(manifest.description ?? "").toLowerCase();
  for (const marker of ["remember", "search", "task context", "forget"]) {
    if (!description.includes(marker)) {
      failures.push(`${CLIENT_PLUGIN_PATH}: description must mention public capability ${JSON.stringify(marker)}`);
    }
  }
}

function assertClaudeMcpConfig(config) {
  const server = config?.mcpServers?.membase;
  if (!server || typeof server !== "object") {
    failures.push(`${MANIFEST_MCP_PATH}: missing mcpServers.membase`);
    return;
  }

  if (!isNonEmptyString(server.command)) {
    failures.push(`${MANIFEST_MCP_PATH}: mcpServers.membase.command must be a non-empty string`);
  }

  if (server.command !== "node") {
    failures.push(`${MANIFEST_MCP_PATH}: command must preserve Claude plugin-local node runtime`);
  }

  if (!Array.isArray(server.args) || server.args.length === 0) {
    failures.push(`${MANIFEST_MCP_PATH}: mcpServers.membase.args must be a non-empty array`);
  }

  if (server.args?.[0] !== "${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs") {
    failures.push(`${MANIFEST_MCP_PATH}: args must point at the plugin-local MCP server`);
  }

  const env = server.env;
  if (!env || typeof env !== "object") {
    failures.push(`${MANIFEST_MCP_PATH}: mcpServers.membase.env is required`);
    return;
  }

  if (env.MEMBASE_CLAUDE_PLUGIN !== "1") {
    failures.push(`${MANIFEST_MCP_PATH}: MEMBASE_CLAUDE_PLUGIN marker must stay enabled`);
  }

  if (env.MEMBASE_API_KEY !== "${MEMBASE_API_KEY}") {
    failures.push(`${MANIFEST_MCP_PATH}: MEMBASE_API_KEY must stay an environment reference`);
  }

  for (const field of ["MEMBASE_API_BASE_URL", "MEMBASE_CLIENT_ID", "MEMBASE_CLIENT_NAME", "MEMBASE_CLIENT_VERSION"]) {
    if (!isNonEmptyString(env[field])) {
      failures.push(`${MANIFEST_MCP_PATH}: mcpServers.membase.env.${field} must be a non-empty string`);
    }
  }
}

function runClaudePluginValidation() {
  const version = spawnSync("claude", ["--version"], {
    encoding: "utf8"
  });

  if (version.error) {
    failures.push(
      "Claude Code CLI is required for claude:plugin-parity. Install @anthropic-ai/claude-code or run this check on a Claude Code review machine."
    );
    return;
  }

  if (version.status !== 0) {
    failures.push(`claude --version failed: ${formatProcessOutput(version)}`);
    return;
  }

  const validation = spawnSync("claude", ["plugin", "validate", path.join(ROOT_DIR, CLIENT_DIR)], {
    encoding: "utf8"
  });

  if (validation.status !== 0) {
    failures.push(`claude plugin validate ${CLIENT_DIR} failed: ${formatProcessOutput(validation)}`);
  }
}

function formatProcessOutput(result) {
  return [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim() || `exit status ${result.status}`;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
