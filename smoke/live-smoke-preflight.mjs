#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const runtimeDecisionPath = "docs/runtime-parity-decisions.md";
const liveRunbookPath = "docs/live-smoke-runbook.md";
const mcpConfigSpecs = [
  { path: "clients/claude/.mcp.json", mode: "claude-plugin-local" },
  { path: "manifests/claude/mcp.json", mode: "claude-plugin-local" },
  { path: "manifests/cursor/mcp.json", mode: "remote-http" },
  { path: "manifests/hermes/mcp.json", mode: "remote-http" },
  { path: "manifests/openclaw/mcp.json", mode: "remote-http" }
];

const failures = [];

const runtimeDecisions = readText(runtimeDecisionPath);
const liveRunbook = readText(liveRunbookPath);
const packageJson = readJson("package.json");

const d2Line = findDecisionLine(runtimeDecisions, "D2");
const d3Line = findDecisionLine(runtimeDecisions, "D3");
const d6Line = findDecisionLine(runtimeDecisions, "D6");

assertIncludes(
  d2Line,
  "Finalized",
  "D2 must be marked Finalized once the per-client runtime/command paths are locked."
);
assertIncludes(
  d3Line,
  "Finalized",
  "D3 must be marked Finalized once the per-client transports are locked."
);
assertIncludes(
  d6Line,
  "pending",
  "D6 must remain pending on accepted live test credentials and cleanup."
);
assertIncludes(liveRunbook, "D2", "Live smoke runbook must name D2 as a precondition.");
assertIncludes(liveRunbook, "D3", "Live smoke runbook must name D3 as a precondition.");
assertIncludes(liveRunbook, "D6", "Live smoke runbook must name D6 as a precondition.");

const liveSmokeScript = packageJson?.scripts?.["smoke:live"];
if (typeof liveSmokeScript === "string") {
  failures.push(
    "package.json defines smoke:live while D2/D3 are still blocked; accept runtime decisions before adding a runnable live smoke command."
  );
}

for (const spec of mcpConfigSpecs) {
  const config = readJson(spec.path);
  const server = config?.mcpServers?.membase;
  if (server === undefined) {
    failures.push(`${spec.path}: missing mcpServers.membase`);
    continue;
  }

  if (spec.mode === "remote-http") {
    if (server.url !== "https://mcp.membase.so/mcp") {
      failures.push(`${spec.path}: expected the remote Membase HTTP MCP endpoint.`);
    }
    if (!server.headers || typeof server.headers !== "object" || Array.isArray(server.headers)) {
      failures.push(`${spec.path}: expected an HTTP MCP headers object.`);
    }
    if (server.command !== undefined || server.args !== undefined) {
      failures.push(`${spec.path}: remote HTTP MCP must not declare a stdio command.`);
    }
    if (server.env?.MEMBASE_API_KEY !== undefined) {
      failures.push(`${spec.path}: must not carry a user-supplied API key (OAuth only).`);
    }
    continue;
  }

  // claude-plugin-local: bundled stdio server, plugin-managed auth, no API key.
  if (server.command !== "node") {
    failures.push(`${spec.path}: expected Claude plugin-local node command.`);
  }
  if (!Array.isArray(server.args) || server.args[0] !== "${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs") {
    failures.push(`${spec.path}: expected Claude plugin-local MCP server path.`);
  }
  if (server.env?.MEMBASE_CLAUDE_PLUGIN !== "1") {
    failures.push(`${spec.path}: expected MEMBASE_CLAUDE_PLUGIN marker.`);
  }
  if (server.env?.MEMBASE_API_KEY !== undefined) {
    failures.push(`${spec.path}: Claude plugin login is used; no MEMBASE_API_KEY belongs in the config.`);
  }
}

if (failures.length > 0) {
  console.error("Live smoke preflight failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "Live smoke preflight passed: Claude plugin-local stdio MCP and Cursor/Hermes/OpenClaw remote HTTP MCP are finalized with no user-supplied API key, and live smoke remains blocked on accepted test credentials and cleanup."
);

function findDecisionLine(content, decisionId) {
  if (typeof content !== "string") {
    return "";
  }

  return content
    .split("\n")
    .find((line) => line.startsWith(`| ${decisionId} |`)) ?? "";
}

function assertIncludes(content, marker, message) {
  if (typeof content !== "string" || !content.includes(marker)) {
    failures.push(message);
  }
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
