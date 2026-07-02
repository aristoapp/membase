#!/usr/bin/env node
// End-to-end verification + quality/latency eval for Membase client connectors.
//
// Tier 1 (default, no credentials): for every committed client MCP config, prove
// the configured endpoint is a live, spec-compliant, correctly-secured MCP
// server — reachability, MCP initialize handshake, OAuth (RFC 9728) discovery
// chain, and latency. Stdio clients (Claude) are config-validated only, since
// their server ships in the client plugin repo, not here.
//
// Tier 2 (--live, needs MEMBASE_MCP_TOKEN): run the full remember -> search ->
// getContext -> forget lifecycle against the live server and score quality
// (tool coverage, recall@1, forget effectiveness) and per-operation latency.
//
// Usage:
//   node e2e/run-e2e.mjs                 # Tier 1
//   MEMBASE_MCP_TOKEN=... node e2e/run-e2e.mjs --live
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  callTool,
  discoverProtectedResource,
  initialize,
  listTools,
  now,
  percentile,
  rpc
} from "./mcp-client.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const TOKEN = process.env.MEMBASE_MCP_TOKEN;
const AUTH_SERVER = "https://api.membase.so";

const CLIENTS = [
  { id: "claude", config: "clients/claude/.mcp.json" },
  { id: "cursor", config: "clients/cursor/mcp.json" },
  { id: "hermes", config: "clients/hermes/mcp.json" },
  { id: "openclaw", config: "clients/openclaw/mcp.json" }
];

const CAPABILITY_MATCHERS = [
  { role: "forget", re: /forget|delete|remove/i },
  { role: "getContext", re: /context/i },
  { role: "search", re: /search|recall|query|find|retriev/i },
  { role: "remember", re: /remember|capture|memor|\bsave\b|\bstore\b|\badd\b/i }
];

const results = [];

for (const client of CLIENTS) {
  const server = readServer(client.config);
  const transport = server?.url ? "http" : server?.command ? "stdio" : "unknown";
  const entry = { id: client.id, transport, config: client.config, checks: [], latency: {}, quality: {} };

  if (transport === "http") {
    await verifyHttp(entry, server.url);
    if (LIVE && TOKEN && entry.checks.every((c) => c.pass)) {
      await evalLive(entry, server.url);
    }
  } else if (transport === "stdio") {
    verifyStdio(entry, server);
  } else {
    entry.checks.push(check("config parseable", false, `no url/command in ${client.config}`));
  }

  entry.pass = entry.checks.every((c) => c.pass);
  results.push(entry);
}

report();
process.exitCode = results.every((r) => r.pass) ? 0 : 1;

// ---------- Tier 1: HTTP transport verification (no credentials) ----------
async function verifyHttp(entry, url) {
  entry.url = url;

  // 1. OAuth protected-resource discovery (RFC 9728)
  const disc = await discoverProtectedResource(url);
  entry.latency.discovery = round(disc.ms);
  entry.checks.push(check("oauth discovery reachable", disc.ok, `HTTP ${disc.status} in ${round(disc.ms)}ms`));
  if (disc.meta) {
    entry.checks.push(check(
      "discovery.resource matches endpoint",
      disc.meta.resource === url,
      `resource=${disc.meta.resource}`
    ));
    entry.checks.push(check(
      "authorization_server = api.membase.so",
      Array.isArray(disc.meta.authorization_servers) && disc.meta.authorization_servers.includes(AUTH_SERVER),
      `servers=${JSON.stringify(disc.meta.authorization_servers)}`
    ));
    entry.discovery = { resource_name: disc.meta.resource_name, scopes: disc.meta.scopes_supported };
  }

  // 2. MCP initialize handshake
  const init = await initialize(url, { token: TOKEN });
  entry.latency.initialize = round(init.steps?.[0]?.ms);

  if (TOKEN) {
    entry.checks.push(check("mcp initialize (authenticated)", init.ok, init.ok ? `session ${short(init.sessionId)}` : `HTTP ${init.status}`));
    entry.sessionId = init.sessionId;
  } else {
    // No token: a correctly-secured MCP server must reject with 401 + WWW-Authenticate Bearer.
    const gated = init.status === 401 && /bearer/i.test(init.wwwAuth ?? "");
    entry.checks.push(check(
      "mcp endpoint speaks MCP + is OAuth-gated (401 Bearer)",
      gated,
      `HTTP ${init.status}${init.wwwAuth ? `, ${init.wwwAuth.split(" ")[0]}` : ""} in ${round(init.steps?.[0]?.ms)}ms`
    ));
    const pointsToDiscovery = (init.wwwAuth ?? "").includes("oauth-protected-resource");
    entry.checks.push(check("WWW-Authenticate advertises discovery", pointsToDiscovery, init.wwwAuth ?? "(none)"));
  }
}

// ---------- Tier 2: live lifecycle + quality/latency eval ----------
async function evalLive(entry, url) {
  const sessionId = entry.sessionId;
  const sentinel = `membase-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const tl = await listTools(url, { token: TOKEN, sessionId });
  entry.latency.toolsList = round(tl.ms);
  const tools = tl.payload?.result?.tools ?? [];
  const roles = matchRoles(tools);
  entry.quality.toolCoverage = `${Object.keys(roles).length}/4`;
  entry.checks.push(check(
    "tools/list exposes remember+search+getContext+forget",
    ["remember", "search", "getContext", "forget"].every((r) => roles[r]),
    Object.entries(roles).map(([r, t]) => `${r}=${t.name}`).join(", ") || "none matched"
  ));

  // remember
  let memoryId;
  if (roles.remember) {
    const r = await callTool(url, { token: TOKEN, sessionId, id: 10, name: roles.remember.name, args: argsFor(roles.remember, { primary: `E2E memory ${sentinel}: the capital of Testland is ${sentinel}.` }) });
    entry.latency.remember = round(r.ms);
    memoryId = extractId(r.payload);
    entry.checks.push(check("remember returns an id", Boolean(memoryId) && !r.payload?.error, memoryId ? `id=${short(memoryId)}` : errText(r)));
  }

  // search (repeat for latency distribution) + recall@1
  if (roles.search) {
    const searchMs = [];
    let recallHit = false;
    let last;
    for (let i = 0; i < 5; i++) {
      last = await callTool(url, { token: TOKEN, sessionId, id: 20 + i, name: roles.search.name, args: argsFor(roles.search, { primary: sentinel }) });
      searchMs.push(last.ms);
      if ((last.raw ?? "").includes(sentinel)) recallHit = true;
    }
    entry.latency.search_p50 = percentile(searchMs, 50);
    entry.latency.search_p95 = percentile(searchMs, 95);
    entry.quality.recallHit = recallHit;
    entry.checks.push(check("recall@1: search finds the remembered memory", recallHit, `p50=${entry.latency.search_p50}ms p95=${entry.latency.search_p95}ms`));
  }

  // getContext
  if (roles.getContext) {
    const c = await callTool(url, { token: TOKEN, sessionId, id: 30, name: roles.getContext.name, args: argsFor(roles.getContext, { primary: `What is the capital of Testland? (${sentinel})` }) });
    entry.latency.getContext = round(c.ms);
    entry.checks.push(check("getContext responds without error", !c.payload?.error && c.status < 400, errText(c) || `${round(c.ms)}ms`));
  }

  // forget + confirm gone
  if (roles.forget && memoryId) {
    const f = await callTool(url, { token: TOKEN, sessionId, id: 40, name: roles.forget.name, args: argsFor(roles.forget, { id: memoryId }) });
    entry.latency.forget = round(f.ms);
    const after = await callTool(url, { token: TOKEN, sessionId, id: 41, name: roles.search.name, args: argsFor(roles.search, { primary: sentinel }) });
    const gone = !(after.raw ?? "").includes(sentinel);
    entry.quality.forgetEffective = gone;
    entry.checks.push(check("forget removes the memory (search no longer recalls it)", gone && !f.payload?.error, gone ? "confirmed gone" : "still recalled"));
  }
}

function verifyStdio(entry, server) {
  entry.command = `${server.command} ${(server.args ?? []).join(" ")}`;
  entry.checks.push(check("stdio command present", Boolean(server.command), entry.command));
  entry.checks.push(check(
    "no embedded credential in env",
    !Object.keys(server.env ?? {}).some((k) => /KEY|TOKEN|SECRET|PASSWORD/i.test(k)),
    `env keys: ${Object.keys(server.env ?? {}).join(",") || "(none)"}`
  ));
  entry.note = "bundled server ships in the Claude plugin repo; live run belongs in claude-membase e2e";
}

// ---------- helpers ----------
function readServer(rel) {
  try {
    const doc = JSON.parse(readFileSync(path.join(ROOT_DIR, rel), "utf8"));
    return doc?.mcpServers?.membase;
  } catch {
    return undefined;
  }
}

function matchRoles(tools) {
  const roles = {};
  for (const { role, re } of CAPABILITY_MATCHERS) {
    if (roles[role]) continue;
    const hit = tools.find((t) => re.test(t.name ?? "") || re.test(t.description ?? ""));
    if (hit) roles[role] = hit;
  }
  return roles;
}

function argsFor(tool, { primary, id }) {
  const schema = tool.inputSchema ?? tool.input_schema ?? {};
  const props = schema.properties ?? {};
  const required = schema.required ?? Object.keys(props);
  const args = {};
  const idKeys = /(^|_)(id|memory_?id|memoryId)$/i;
  const textKeys = /content|text|memory|note|query|q|task|prompt|input|message/i;
  for (const key of required) {
    const type = props[key]?.type ?? "string";
    if (id !== undefined && idKeys.test(key)) args[key] = id;
    else if (primary !== undefined && textKeys.test(key)) args[key] = primary;
    else if (type === "string") args[key] = primary ?? id ?? "membase-e2e";
    else if (type === "number" || type === "integer") args[key] = props[key]?.minimum ?? 5;
    else if (type === "boolean") args[key] = false;
    else if (type === "array") args[key] = [];
  }
  // Ensure the primary payload lands somewhere even if not "required".
  if (primary !== undefined && !Object.values(args).includes(primary)) {
    const target = Object.keys(props).find((k) => textKeys.test(k));
    if (target) args[target] = primary;
  }
  if (id !== undefined && !Object.values(args).includes(id)) {
    const target = Object.keys(props).find((k) => idKeys.test(k));
    if (target) args[target] = id;
  }
  return args;
}

function extractId(payload) {
  if (!payload) return undefined;
  const text = JSON.stringify(payload);
  const m = text.match(/"(?:id|memoryId|memory_id)"\s*:\s*"?([\w-]{6,})"?/i);
  return m?.[1];
}

function errText(r) {
  if (r?.payload?.error) return `error: ${r.payload.error.message ?? JSON.stringify(r.payload.error)}`;
  if (r?.status >= 400) return `HTTP ${r.status}`;
  if (r?.transportError) return r.transportError;
  return "";
}

function check(name, pass, detail) {
  return { name, pass: Boolean(pass), detail: detail ?? "" };
}
function round(ms) {
  return ms === undefined || ms === null ? null : Math.round(ms * 10) / 10;
}
function short(v) {
  return typeof v === "string" && v.length > 12 ? `${v.slice(0, 12)}…` : String(v);
}

function report() {
  const mode = LIVE ? (TOKEN ? "LIVE (Tier 1 + Tier 2)" : "LIVE requested but MEMBASE_MCP_TOKEN missing — Tier 1 only") : "Tier 1 (reachability + protocol + discovery)";
  console.log(`\nMembase connector E2E — ${mode}\n${"=".repeat(60)}`);
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`\n[${status}] ${r.id}  (${r.transport}${r.url ? ` ${r.url}` : ""})`);
    if (r.discovery?.resource_name) console.log(`  resource: ${r.discovery.resource_name}`);
    for (const c of r.checks) {
      console.log(`   ${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
    }
    const lat = Object.entries(r.latency).filter(([, v]) => v != null);
    if (lat.length) console.log(`   latency: ${lat.map(([k, v]) => `${k}=${v}ms`).join("  ")}`);
    const q = Object.entries(r.quality);
    if (q.length) console.log(`   quality: ${q.map(([k, v]) => `${k}=${v}`).join("  ")}`);
    if (r.note) console.log(`   note: ${r.note}`);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${"=".repeat(60)}\n${passed}/${results.length} clients passed.\n`);
}
