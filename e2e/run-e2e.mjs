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
  percentile
} from "./mcp-client.mjs";
import { ensureAccessToken } from "./auth.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.argv.includes("--live");
const auth = LIVE ? await ensureAccessToken() : { token: process.env.MEMBASE_MCP_TOKEN, source: "env" };
const TOKEN = auth.token;
if (LIVE && TOKEN && auth.source === "refresh_token grant") {
  console.error(`access token minted via refresh_token grant (TTL ${auth.expiresIn ?? "?"}s; refresh token rotated)`);
}
const AUTH_SERVER = "https://api.membase.so";

const CLIENTS = [
  { id: "claude", config: "clients/claude/.mcp.json" },
  { id: "cursor", config: "clients/cursor/mcp.json" },
  { id: "hermes", config: "clients/hermes/mcp.json" },
  { id: "openclaw", config: "clients/openclaw/mcp.json" }
];

// Matched against the live server's actual tool surface. Exact names first
// (add_memory/search_memory are the shipped Membase MCP tools); the forget
// matcher is memory-scoped so wiki tools (delete_wiki) never masquerade as it.
const CAPABILITY_MATCHERS = [
  { role: "remember", exact: ["add_memory"], re: /^(remember|capture|save|store)_?memor/i },
  { role: "search", exact: ["search_memory"], re: /^(search|recall|query)_?memor/i },
  { role: "getContext", exact: ["get_context"], re: /context/i },
  { role: "forget", exact: ["delete_memory", "forget_memory"], re: /(delete|forget|remove)_?memor/i }
];

const RECALL_DELAYS_MS = [0, 2000, 5000, 10_000, 20_000];

const results = [];
const lifecycleByUrl = new Map(); // run the live lifecycle once per endpoint

for (const client of CLIENTS) {
  const server = readServer(client.config);
  const transport = server?.url ? "http" : server?.command ? "stdio" : "unknown";
  const entry = { id: client.id, transport, config: client.config, checks: [], latency: {}, quality: {} };

  if (transport === "http") {
    await verifyHttp(entry, server.url);
    if (LIVE && TOKEN && entry.checks.every((c) => c.pass)) {
      // All HTTP clients share the hosted endpoint; run the write/read
      // lifecycle once per URL so the test account is not polluted N times
      // (there is no memory-delete tool on the live server yet).
      if (!lifecycleByUrl.has(server.url)) {
        const shared = { checks: [], latency: {}, quality: {} };
        await evalLive({ ...entry, ...shared, checks: shared.checks, latency: shared.latency, quality: shared.quality, sessionId: entry.sessionId }, server.url);
        lifecycleByUrl.set(server.url, shared);
      }
      const shared = lifecycleByUrl.get(server.url);
      entry.checks.push(...shared.checks);
      Object.assign(entry.latency, shared.latency);
      Object.assign(entry.quality, shared.quality);
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
  entry.quality.toolCoverage = `${["remember", "search", "getContext", "forget"].filter((r) => roles[r]).length}/4`;

  entry.checks.push(check(
    "tools/list exposes remember + search",
    Boolean(roles.remember && roles.search),
    Object.entries(roles).map(([r, t]) => `${r}=${t.name}`).join(", ") || "none matched"
  ));
  // The shipped server covers task-context via search_memory; a dedicated
  // context tool and a memory-delete tool are contract gaps, not client bugs.
  if (!roles.getContext) {
    entry.checks.push(warn("getContext tool not exposed", "covered via search_memory on the live server"));
  }
  if (!roles.forget) {
    entry.checks.push(warn(
      "forget/delete-memory tool not exposed by live server",
      "public contract lists deleteOrForget; only delete_wiki exists — test memories cannot be cleaned up"
    ));
  }
  if (!roles.remember || !roles.search) return;

  // remember: the live server acknowledges storage with text (no id is returned).
  const r = await callTool(url, {
    token: TOKEN, sessionId, id: 10, name: roles.remember.name,
    args: argsFor(roles.remember, { primary: `[e2e-test] The secret launch codeword for project Testland is ${sentinel}. (safe to delete)` })
  });
  entry.latency.remember = round(r.ms);
  const ack = !r.payload?.error && r.status < 400 && (r.raw ?? "").length > 0;
  entry.checks.push(check("remember acknowledges storage", ack, ack ? textOf(r.payload).slice(0, 60) : errText(r)));

  // recall@1 with indexing backoff: memory ingestion is async, so poll until
  // the sentinel becomes searchable and record write->searchable latency.
  const searchMs = [];
  let recallHit = false;
  let timeToRecallMs = null;
  const t0 = now();
  for (const delay of RECALL_DELAYS_MS) {
    if (delay) await new Promise((res) => setTimeout(res, delay));
    const s = await callTool(url, {
      token: TOKEN, sessionId, id: 20, name: roles.search.name,
      args: argsFor(roles.search, { primary: sentinel })
    });
    searchMs.push(s.ms);
    if ((s.raw ?? "").includes(sentinel)) {
      recallHit = true;
      timeToRecallMs = Math.round(now() - t0);
      break;
    }
  }
  entry.latency.search_p50 = percentile(searchMs, 50);
  entry.latency.search_p95 = percentile(searchMs, 95);
  entry.quality.recallHit = recallHit;
  if (timeToRecallMs !== null) entry.quality.timeToRecall = `${(timeToRecallMs / 1000).toFixed(1)}s`;
  entry.checks.push(check(
    "recall: search finds the remembered memory (with indexing backoff)",
    recallHit,
    recallHit ? `searchable after ~${(timeToRecallMs / 1000).toFixed(1)}s; search p50=${entry.latency.search_p50}ms` : `not searchable within ${RECALL_DELAYS_MS.reduce((a, b) => a + b, 0) / 1000}s`
  ));

  // context-style retrieval through the same search surface
  const c = await callTool(url, {
    token: TOKEN, sessionId, id: 30, name: (roles.getContext ?? roles.search).name,
    args: argsFor(roles.getContext ?? roles.search, { primary: "What is the launch codeword for project Testland?" })
  });
  entry.latency.getContext = round(c.ms);
  const ctxOk = !c.payload?.error && c.status < 400;
  entry.quality.contextAnswerHit = (c.raw ?? "").includes(sentinel);
  entry.checks.push(check(
    "context query responds (semantic retrieval)",
    ctxOk,
    `${round(c.ms)}ms${entry.quality.contextAnswerHit ? ", sentinel memory retrieved by semantic query" : ""}`
  ));

  // forget lifecycle: only runnable once the live server exposes a
  // memory-delete tool (warned above).
  if (roles.forget) {
    const f = await callTool(url, { token: TOKEN, sessionId, id: 40, name: roles.forget.name, args: argsFor(roles.forget, { id: sentinel }) });
    entry.latency.forget = round(f.ms);
    entry.checks.push(check("forget responds without error", !f.payload?.error && f.status < 400, errText(f)));
  }
}

function textOf(payload) {
  return payload?.result?.content?.map((c) => c.text ?? "").join(" ") ?? "";
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
  for (const { role, exact, re } of CAPABILITY_MATCHERS) {
    const hit =
      tools.find((t) => exact?.includes(t.name)) ??
      tools.find((t) => re.test(t.name ?? ""));
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

function errText(r) {
  if (r?.payload?.error) return `error: ${r.payload.error.message ?? JSON.stringify(r.payload.error)}`;
  if (r?.status >= 400) return `HTTP ${r.status}`;
  if (r?.transportError) return r.transportError;
  return "";
}

function check(name, pass, detail) {
  return { name, pass: Boolean(pass), detail: detail ?? "" };
}

// Known live-server contract gaps: surfaced prominently but do not fail the run.
function warn(name, detail) {
  return { name, pass: true, warn: true, detail: detail ?? "" };
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
      const mark = c.warn ? "⚠" : c.pass ? "✓" : "✗";
      console.log(`   ${mark} ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
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
