#!/usr/bin/env node
// End-to-end verification + quality/latency eval for Membase client connectors.
//
// Tier 1 (default, no credentials): for every committed client MCP config, prove
// the configured endpoint is a live, spec-compliant, correctly-secured MCP
// server — reachability, MCP initialize handshake, OAuth (RFC 9728) discovery
// chain, and latency. Stdio clients (Claude) are config-validated only, since
// their server ships in the client plugin repo, not here.
//
// Tier 2 (--live, needs a token): fast live smoke — authed initialize, tool
// coverage, remember accepted, search endpoint responds. No waiting on async
// indexing, so it stays a ~seconds merge-gate check.
//
// Tier 3 (--tier3, needs a token): deep quality/latency eval on top of Tier 2 —
// recall@1 with indexing backoff, search-latency percentiles, semantic context
// retrieval, and the forget lifecycle. Minutes-long; for nightly runs.
//
// Usage:
//   node e2e/run-e2e.mjs                 # Tier 1
//   MEMBASE_MCP_TOKEN=... node e2e/run-e2e.mjs --live    # + Tier 2 (fast)
//   MEMBASE_MCP_TOKEN=... node e2e/run-e2e.mjs --tier3   # + Tier 2 + Tier 3 (deep)
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
// Tiers:
//   (none)   Tier 1 — reachability + protocol + OAuth discovery (no creds).
//   --live   Tier 1 + Tier 2 — fast live smoke: authed initialize, tool
//            coverage, remember accepted, search endpoint responds. No waiting
//            on async indexing, so it stays a ~seconds merge-gate check.
//   --tier3  Tier 1 + Tier 2 + Tier 3 — deep quality/latency eval: recall@1
//            with indexing backoff, latency percentiles, semantic context
//            retrieval, forget. Minutes-long; for nightly runs.
const TIER3 = process.argv.includes("--tier3");
const LIVE = process.argv.includes("--live") || TIER3;
const auth = LIVE ? await ensureAccessToken() : { token: process.env.MEMBASE_MCP_TOKEN, source: "env" };
const TOKEN = auth.token;
if (LIVE && TOKEN && auth.source !== "env access token") {
  console.error(`access token minted via ${auth.source} (TTL ${auth.expiresIn ?? "?"}s)`);
}
// Endpoint selection. Defaults target production; a staging (or preview) run
// overrides these so the same harness verifies whichever environment CI points
// at. MEMBASE_AUTH_BASE is the expected authorization server advertised by
// discovery; MEMBASE_MCP_URL, when set, replaces each client config's MCP URL
// so the lifecycle runs against that endpoint (its token audience must match).
const AUTH_SERVER = process.env.MEMBASE_AUTH_BASE ?? "https://api.membase.so";
const MCP_URL_OVERRIDE = process.env.MEMBASE_MCP_URL;

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

const RECALL_POLL_INTERVAL_MS = Number(process.env.MEMBASE_E2E_RECALL_POLL_MS ?? 5000);

// Tier 3 tool contract: the declared "should" set of tools every run must
// expose and be able to exercise. Basis = the tools the MCP server actually
// ships (memory add/search, get_current_date, wiki add/search/update/delete).
// If any expected tool disappears, the presence check fails the run. Wiki has a
// full CRUD surface, so evalContract runs an add -> search -> update -> delete
// -> confirm-gone round-trip that cleans up after itself; memory add/search
// recall is covered by evalLiveDeep.
const EXPECTED_TOOLS = [
  "add_memory",
  "search_memory",
  "get_current_date",
  "search_wiki",
  "add_wiki",
  "update_wiki",
  "delete_wiki",
];
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Tier 3 quality gates (env-tunable). Defaults sit well above observed staging
// values (search p95 ~0.8s, write→searchable ~40s) so they catch gross
// regressions without being flaky.
const QUALITY_MAX_SEARCH_P95_MS = Number(process.env.MEMBASE_E2E_MAX_SEARCH_P95_MS ?? 3000);
// Recall gates split correctness from performance because async indexing
// latency on staging is genuinely variable (observed ~30s to >60s):
//   MAX    — hard ceiling; a memory that never becomes searchable within this
//            is a real failure (default 180s, generous to avoid flakiness).
//   TARGET — soft SLO; slower-than-this recall warns (surfaces the perf story)
//            but does not fail the run (default 60s).
const QUALITY_MAX_RECALL_MS = Number(process.env.MEMBASE_E2E_MAX_RECALL_MS ?? 180000);
const QUALITY_TARGET_RECALL_MS = Number(process.env.MEMBASE_E2E_TARGET_RECALL_MS ?? 60000);

const results = [];
const lifecycleByUrl = new Map(); // run the live lifecycle once per endpoint

for (const client of CLIENTS) {
  const server = readServer(client.config);
  const transport = server?.url ? "http" : server?.command ? "stdio" : "unknown";
  const entry = { id: client.id, transport, config: client.config, checks: [], latency: {}, quality: {} };

  if (transport === "http") {
    // A staging/preview run overrides the committed (prod) URL so the same
    // connector config is verified against the target environment.
    const url = MCP_URL_OVERRIDE ?? server.url;
    await verifyHttp(entry, url);
    if (LIVE && TOKEN && entry.checks.every((c) => c.pass)) {
      // All HTTP clients share the hosted endpoint; run the write/read
      // lifecycle once per URL so the test account is not polluted N times
      // (there is no memory-delete tool on the live server yet).
      if (!lifecycleByUrl.has(url)) {
        const shared = { checks: [], latency: {}, quality: {} };
        const ctx = { ...entry, ...shared, checks: shared.checks, latency: shared.latency, quality: shared.quality, sessionId: entry.sessionId };
        const fast = await evalLiveFast(ctx, url); // Tier 2 (fast)
        if (TIER3 && fast) {
          await evalLiveDeep(ctx, url, fast.roles); // Tier 3 (deep quality/latency + gates)
          await evalContract(ctx, url, fast.tools); // Tier 3 (tool contract, basis: 7 shipped tools)
          await evalNegative(ctx, url); // Tier 3 (rejection behavior)
        }
        lifecycleByUrl.set(url, shared);
      }
      const shared = lifecycleByUrl.get(url);
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
      `authorization_server = ${AUTH_SERVER}`,
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

// ---------- Tier 2: fast live smoke (no async-indexing waits) ----------
// Proves the authed surface works: tools are exposed, a write is accepted, and
// the search endpoint responds. Recall correctness + quality are Tier 3. The
// remembered sentinel is stashed on the entry so Tier 3 can reuse it.
// Returns the resolved roles (for Tier 3) or null if the surface is unusable.
async function evalLiveFast(entry, url) {
  const sessionId = entry.sessionId;
  const sentinel = `membase-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  entry.sentinel = sentinel;

  const tl = await listTools(url, { token: TOKEN, sessionId });
  entry.latency.toolsList = round(tl.ms);
  const toolObjs = tl.payload?.result?.tools ?? [];
  const roles = matchRoles(toolObjs);
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
  if (!roles.remember || !roles.search) return null;

  // remember: the live server acknowledges storage with text (no id is returned).
  const r = await callTool(url, {
    token: TOKEN, sessionId, id: 10, name: roles.remember.name,
    args: argsFor(roles.remember, { primary: `[e2e-test] The secret launch codeword for project Testland is ${sentinel}. (safe to delete)` })
  });
  entry.latency.remember = round(r.ms);
  const ack = !r.payload?.error && r.status < 400 && (r.raw ?? "").length > 0;
  entry.checks.push(check("remember acknowledges storage", ack, ack ? textOf(r.payload).slice(0, 60) : errText(r)));

  // search endpoint responds (no recall-hit wait — indexing is async; recall
  // correctness is judged in Tier 3). This keeps Tier 2 a ~seconds check.
  const s = await callTool(url, {
    token: TOKEN, sessionId, id: 20, name: roles.search.name,
    args: argsFor(roles.search, { primary: sentinel })
  });
  entry.latency.search = round(s.ms);
  entry.checks.push(check(
    "search responds without error",
    !s.payload?.error && s.status < 400,
    `${round(s.ms)}ms (recall correctness verified in Tier 3)`
  ));

  return { roles, tools: toolObjs };
}

// ---------- Tier 3: tool contract suite (basis: the shipped tool surface) ----------
async function evalContract(entry, url, tools) {
  const sessionId = entry.sessionId;
  const names = new Set(tools.map((t) => t.name));
  const call = (name, args, id) => callTool(url, { token: TOKEN, sessionId, id, name, args });

  // 1. Presence — every expected tool must be exposed (regression guard).
  let missing = 0;
  for (const name of EXPECTED_TOOLS) {
    const present = names.has(name);
    if (!present) missing++;
    entry.checks.push(check(`contract: ${name} exposed`, present, present ? "present" : "MISSING from tools/list"));
  }
  entry.quality.contractToolsPresent = `${EXPECTED_TOOLS.length - missing}/${EXPECTED_TOOLS.length}`;

  // 2. get_current_date returns an actual date.
  if (names.has("get_current_date")) {
    const d = await call("get_current_date", {}, 50);
    const hasDate = /\d{4}-\d{2}-\d{2}/.test(d.raw ?? "");
    entry.checks.push(check(
      "contract: get_current_date returns a date",
      !d.payload?.error && d.status < 400 && hasDate,
      hasDate ? "ISO date present" : errText(d) || "no date in response"
    ));
  }

  // 3. Wiki full lifecycle (create -> read -> update -> delete -> confirm gone).
  const wikiTools = ["add_wiki", "search_wiki", "update_wiki", "delete_wiki"];
  if (wikiTools.every((n) => names.has(n))) {
    const stamp = `e2e-wiki-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const add = await call("add_wiki", { title: `[e2e] ${stamp}`, content: `Contract wiki body for ${stamp}. (safe to delete)` }, 51);
    const addOk = !add.payload?.error && add.status < 400;
    const docId = (add.raw ?? "").match(UUID_RE)?.[0];
    entry.checks.push(check(
      "contract: add_wiki stores a document",
      addOk,
      addOk ? (docId ? `doc_id=${short(docId)}` : "stored (no doc_id in response)") : errText(add)
    ));

    // search finds it (wiki indexing may be async — brief backoff)
    let found = false;
    for (const delay of [0, 3000, 8000]) {
      if (delay) await new Promise((res) => setTimeout(res, delay));
      const s = await call("search_wiki", { query: stamp }, 52);
      if ((s.raw ?? "").includes(stamp)) { found = true; break; }
    }
    entry.checks.push(check("contract: search_wiki finds the added document", found, found ? "found by sentinel" : "not searchable within ~11s"));

    if (docId) {
      const upd = await call("update_wiki", { doc_id: docId, content: `Updated contract body ${stamp}` }, 53);
      entry.checks.push(check("contract: update_wiki succeeds", !upd.payload?.error && upd.status < 400, errText(upd) || "updated"));

      const del = await call("delete_wiki", { doc_id: docId }, 54);
      entry.checks.push(check("contract: delete_wiki succeeds", !del.payload?.error && del.status < 400, errText(del) || "deleted"));

      // confirm cleanup (small backoff for index to catch up)
      let gone = false;
      for (const delay of [1000, 4000]) {
        await new Promise((res) => setTimeout(res, delay));
        const s2 = await call("search_wiki", { query: stamp }, 55);
        if (!(s2.raw ?? "").includes(stamp)) { gone = true; break; }
      }
      entry.checks.push(check("contract: deleted wiki no longer found", gone, gone ? "cleaned up" : "still searchable after delete"));
    } else {
      entry.checks.push(warn("contract: wiki update/delete skipped", "add_wiki returned no doc_id to target"));
    }
  }
}

// ---------- Tier 3: deep quality/latency eval (async-indexing waits) ----------
// The slow, correctness-and-quality half: waits out async indexing to judge
// recall@1, records search-latency percentiles, checks semantic context
// retrieval, and runs the forget lifecycle when a delete tool exists.
async function evalLiveDeep(entry, url, roles) {
  const sessionId = entry.sessionId;
  const sentinel = entry.sentinel; // reuse the memory written in Tier 2

  // recall@1: memory ingestion is async, so poll the sentinel on a fixed
  // interval until it becomes searchable OR the recall SLO deadline elapses.
  // Polling to the deadline (not a fixed short budget) keeps this stable when
  // indexing latency varies and makes the "≤ SLO" gate meaningful.
  const searchMs = [];
  let recallHit = false;
  let timeToRecallMs = null;
  const t0 = now();
  let attempt = 0;
  while (true) {
    const s = await callTool(url, {
      token: TOKEN, sessionId, id: 21, name: roles.search.name,
      args: argsFor(roles.search, { primary: sentinel })
    });
    searchMs.push(s.ms);
    if ((s.raw ?? "").includes(sentinel)) {
      recallHit = true;
      timeToRecallMs = Math.round(now() - t0);
      break;
    }
    attempt++;
    if (now() - t0 + RECALL_POLL_INTERVAL_MS > QUALITY_MAX_RECALL_MS) break;
    await new Promise((res) => setTimeout(res, RECALL_POLL_INTERVAL_MS));
  }
  entry.latency.search_p50 = percentile(searchMs, 50);
  entry.latency.search_p95 = percentile(searchMs, 95);
  entry.quality.recallHit = recallHit;
  if (timeToRecallMs !== null) entry.quality.timeToRecall = `${(timeToRecallMs / 1000).toFixed(1)}s`;
  entry.checks.push(check(
    `recall: search finds the remembered memory within ${QUALITY_MAX_RECALL_MS / 1000}s`,
    recallHit,
    recallHit ? `searchable after ~${(timeToRecallMs / 1000).toFixed(1)}s; search p50=${entry.latency.search_p50}ms` : `not searchable within ${QUALITY_MAX_RECALL_MS / 1000}s (${attempt} polls)`
  ));
  // Soft SLO: recall correctness passed above, but flag slow indexing.
  if (recallHit && timeToRecallMs > QUALITY_TARGET_RECALL_MS) {
    entry.checks.push(warn(
      `recall slower than ${QUALITY_TARGET_RECALL_MS / 1000}s target`,
      `write→searchable ~${(timeToRecallMs / 1000).toFixed(1)}s`
    ));
  }

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

  // ----- Quality gates: turn measured quality/latency into hard pass/fail so a
  // regression fails the run instead of silently degrading. (The recall check
  // above already gates write→searchable against the SLO deadline.) The context
  // gate only applies once the memory is searchable — if it never indexed, the
  // recall check is the single clear failure, not a duplicate context failure.
  if (recallHit) {
    entry.checks.push(check(
      "quality gate: semantic context retrieves the sentinel",
      entry.quality.contextAnswerHit,
      entry.quality.contextAnswerHit ? "sentinel returned by semantic query" : "context query did not return the sentinel"
    ));
  }
  if (entry.latency.search_p95 != null) {
    entry.checks.push(check(
      `quality gate: search p95 ≤ ${QUALITY_MAX_SEARCH_P95_MS}ms`,
      entry.latency.search_p95 <= QUALITY_MAX_SEARCH_P95_MS,
      `search p95=${entry.latency.search_p95}ms`
    ));
  }

  // forget lifecycle: only runnable once the live server exposes a
  // memory-delete tool (warned in Tier 2).
  if (roles.forget) {
    const f = await callTool(url, { token: TOKEN, sessionId, id: 40, name: roles.forget.name, args: argsFor(roles.forget, { id: sentinel }) });
    entry.latency.forget = round(f.ms);
    entry.checks.push(check("forget responds without error", !f.payload?.error && f.status < 400, errText(f)));
  }
}

// The MCP SDK surfaces tool-level failures as a *successful* response whose
// result carries isError:true and an "MCP error ..." text — not a JSON-RPC
// error. Negative-case checks must look here, not at payload.error.
function toolErrored(r) {
  return r?.payload?.result?.isError === true;
}

// ---------- Tier 3: negative cases (rejection behavior) ----------
// Proves the endpoint rejects what it should: unauthenticated/invalid tokens
// (transport-level 401) and malformed tool calls (tool-level isError). A server
// that silently accepts these is a real security/contract regression.
async function evalNegative(entry, url) {
  // Auth negatives — the endpoint must be OAuth-gated.
  const noTok = await initialize(url, { token: undefined });
  const noTokGated = noTok.status === 401 && /bearer/i.test(noTok.wwwAuth ?? "");
  entry.checks.push(check(
    "negative: no token → 401 Bearer",
    noTokGated,
    `HTTP ${noTok.status}${noTok.wwwAuth ? `, ${noTok.wwwAuth.split(" ")[0]}` : ""}`
  ));

  const badTok = await initialize(url, { token: "forged.invalid.token" });
  entry.checks.push(check("negative: forged token → 401", badTok.status === 401, `HTTP ${badTok.status}`));

  // Input negatives — need a valid session; reuse the Tier 2/3 one.
  const sessionId = entry.sessionId;
  if (!sessionId) return;

  const missing = await callTool(url, { token: TOKEN, sessionId, id: 60, name: "add_memory", args: {} });
  entry.checks.push(check(
    "negative: add_memory without required content → validation error",
    toolErrored(missing) && /validation|invalid|required/i.test(textOf(missing.payload)),
    (textOf(missing.payload) || errText(missing) || "no error").slice(0, 80)
  ));

  const empty = await callTool(url, { token: TOKEN, sessionId, id: 61, name: "add_memory", args: { content: "" } });
  entry.checks.push(check(
    "negative: add_memory with empty content → validation error",
    toolErrored(empty),
    (textOf(empty.payload) || errText(empty) || "no error").slice(0, 80)
  ));

  const unknown = await callTool(url, { token: TOKEN, sessionId, id: 62, name: "definitely_not_a_tool", args: {} });
  entry.checks.push(check(
    "negative: unknown tool → error",
    toolErrored(unknown) && /not found|unknown/i.test(textOf(unknown.payload)),
    (textOf(unknown.payload) || errText(unknown) || "no error").slice(0, 80)
  ));
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
