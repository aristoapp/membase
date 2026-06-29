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
  { path: "manifests/cursor/mcp.json", mode: "cursor-http" },
  { path: "manifests/hermes/mcp.json", mode: "placeholder-stdio" },
  { path: "manifests/openclaw/mcp.json", mode: "placeholder-stdio" }
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
  "Claude plugin-local, Cursor HTTP-first, Hermes provider import/register boundary, and OpenClaw native entrypoint implemented; Hermes runtime API behavior pending",
  "D2 must record Claude plugin-local, Cursor HTTP-first, Hermes provider boundary, and OpenClaw native entrypoint implementation while Hermes live API behavior remains pending."
);
assertIncludes(
  d3Line,
  "Claude plugin-local, Cursor HTTP-primary, Hermes provider register path, and OpenClaw native entrypoint implemented; fallback decisions pending",
  "D3 must record Claude plugin-local, Cursor HTTP-primary, Hermes provider register path, and OpenClaw native entrypoint implementation while fallback decisions remain pending."
);
assertIncludes(
  d6Line,
  "Accepted in principle; pending D2/D3",
  "D6 must remain accepted in principle but blocked on D2/D3."
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

  if (spec.mode === "cursor-http") {
    if (server.url !== "https://mcp.membase.so/mcp") {
      failures.push(`${spec.path}: expected Cursor HTTP MCP endpoint.`);
    }
    if (!server.headers || typeof server.headers !== "object" || Array.isArray(server.headers)) {
      failures.push(`${spec.path}: expected Cursor HTTP MCP headers object.`);
    }
    if (server.command !== undefined || server.args !== undefined) {
      failures.push(`${spec.path}: Cursor must not use the placeholder stdio command.`);
    }
    continue;
  }

  if (spec.mode === "claude-plugin-local") {
    if (server.command !== "node") {
      failures.push(`${spec.path}: expected Claude plugin-local node command.`);
    }
    if (!Array.isArray(server.args) || server.args[0] !== "${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs") {
      failures.push(`${spec.path}: expected Claude plugin-local MCP server path.`);
    }
    if (server.env?.MEMBASE_CLAUDE_PLUGIN !== "1") {
      failures.push(`${spec.path}: expected MEMBASE_CLAUDE_PLUGIN marker.`);
    }
    const apiKeyReference = server.env?.MEMBASE_API_KEY;
    if (typeof apiKeyReference !== "string" || !apiKeyReference.includes("MEMBASE_API_KEY")) {
      failures.push(`${spec.path}: missing MEMBASE_API_KEY environment reference.`);
    }
    continue;
  }

  if (server.command !== "npx") {
    failures.push(`${spec.path}: expected placeholder command npx while this runtime path is blocked.`);
  }

  if (!Array.isArray(server.args) || !server.args.includes("@membase/mcp-server")) {
    failures.push(`${spec.path}: expected @membase/mcp-server placeholder while this runtime path is blocked.`);
  }

  const apiKeyReference = server.env?.MEMBASE_API_KEY;
  if (typeof apiKeyReference !== "string" || !apiKeyReference.includes("MEMBASE_API_KEY")) {
    failures.push(`${spec.path}: missing MEMBASE_API_KEY environment reference.`);
  }
}

assertIncludes(
  runtimeDecisions,
  "npm view @membase/mcp-server",
  "Runtime ledger must record the npm availability check while the placeholder package is unresolved."
);
assertIncludes(
  runtimeDecisions,
  "returned npm 404",
  "Runtime ledger must record that @membase/mcp-server is not currently available."
);

if (failures.length > 0) {
  console.error("Live smoke preflight failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "Live smoke preflight passed: Claude plugin-local MCP, Cursor HTTP MCP, Hermes provider register path, and OpenClaw native entrypoint are preserved, Hermes live API behavior remains pending, and live smoke remains blocked on accepted test credentials and cleanup."
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
