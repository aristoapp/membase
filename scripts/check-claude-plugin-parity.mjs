#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The repo root is the Claude plugin: root .claude-plugin/ + .mcp.json are
// what `claude plugin marketplace add` and the plugins CLI install.
const CLIENT_PLUGIN_PATH = ".claude-plugin/plugin.json";
const CLIENT_MCP_PATH = ".mcp.json";
const CLIENT_PACKAGE_PATH = "clients/claude/package.json";

const failures = [];

const clientPlugin = readJson(CLIENT_PLUGIN_PATH);
const mcpConfig = readJson(CLIENT_MCP_PATH);
const clientPackage = readJson(CLIENT_PACKAGE_PATH);

if (clientPlugin) {
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
  for (const marker of ["memory", "search", "wiki", "handoff"]) {
    if (!description.includes(marker)) {
      failures.push(`${CLIENT_PLUGIN_PATH}: description must mention public capability ${JSON.stringify(marker)}`);
    }
  }
}

function assertClaudeMcpConfig(config) {
  const server = config?.mcpServers?.membase;
  if (!server || typeof server !== "object") {
    failures.push(`${CLIENT_MCP_PATH}: missing mcpServers.membase`);
    return;
  }

  if (!isNonEmptyString(server.command)) {
    failures.push(`${CLIENT_MCP_PATH}: mcpServers.membase.command must be a non-empty string`);
  }

  if (server.command !== "node") {
    failures.push(`${CLIENT_MCP_PATH}: command must preserve Claude plugin-local node runtime`);
  }

  if (!Array.isArray(server.args) || server.args.length === 0) {
    failures.push(`${CLIENT_MCP_PATH}: mcpServers.membase.args must be a non-empty array`);
  }

  if (server.args?.[0] !== "${CLAUDE_PLUGIN_ROOT}/hooks/mcp-server.cjs") {
    failures.push(`${CLIENT_MCP_PATH}: args must point at the plugin-local MCP server`);
  }

  const env = server.env;
  if (!env || typeof env !== "object") {
    failures.push(`${CLIENT_MCP_PATH}: mcpServers.membase.env is required`);
    return;
  }

  if (env.MEMBASE_CLAUDE_PLUGIN !== "1") {
    failures.push(`${CLIENT_MCP_PATH}: MEMBASE_CLAUDE_PLUGIN marker must stay enabled`);
  }

  // The bundled plugin manages login; the config must carry no user-supplied
  // API key, host, or client metadata env — only the plugin flag.
  if ("MEMBASE_API_KEY" in env) {
    failures.push(`${CLIENT_MCP_PATH}: must not carry MEMBASE_API_KEY (Claude plugin login is used)`);
  }

  for (const field of ["MEMBASE_API_BASE_URL", "MEMBASE_CLIENT_ID", "MEMBASE_CLIENT_NAME", "MEMBASE_CLIENT_VERSION"]) {
    if (field in env) {
      failures.push(`${CLIENT_MCP_PATH}: mcpServers.membase.env.${field} must not be set (bundled server handles it)`);
    }
  }

  if (Object.keys(env).length !== 1) {
    failures.push(`${CLIENT_MCP_PATH}: env must contain only MEMBASE_CLAUDE_PLUGIN`);
  }
}

function runClaudePluginValidation() {
  const version = spawnSync("claude", ["--version"], {
    encoding: "utf8"
  });

  if (version.error) {
    // CI must have the CLI; a local clone without it still gets the static
    // manifest checks above, just not live plugin validation.
    if (process.env.CI) {
      failures.push(
        "Claude Code CLI is required for claude:plugin-parity in CI. Install @anthropic-ai/claude-code."
      );
    } else {
      console.warn(
        "claude:plugin-parity: Claude Code CLI not found — skipping live plugin validation (static manifest checks still ran)."
      );
    }
    return;
  }

  if (version.status !== 0) {
    failures.push(`claude --version failed: ${formatProcessOutput(version)}`);
    return;
  }

  const validation = spawnSync("claude", ["plugin", "validate", ROOT_DIR], {
    encoding: "utf8"
  });

  if (validation.status !== 0) {
    failures.push(`claude plugin validate <repo root> failed: ${formatProcessOutput(validation)}`);
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
