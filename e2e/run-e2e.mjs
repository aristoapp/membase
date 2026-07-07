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
  listResources,
  listTools,
  now,
  percentile,
  readResource
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
// The OpenClaw/Cursor/etc. runtime clients talk to the REST API directly
// (/memory/ingest, /memory/search) rather than the MCP tool surface. The
// handoff round-trip below exercises that path, so it needs the REST base.
const REST_API_BASE = process.env.MEMBASE_API_BASE ?? AUTH_SERVER;

const CLIENTS = [
  { id: "claude", config: "clients/claude/.mcp.json" },
  { id: "cursor", config: "clients/cursor/mcp.json" },
  { id: "codex", config: "clients/codex/.mcp.json" },
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
// Basis: apps/mcp/src/resources.ts registers exactly these two resource URIs.
const EXPECTED_RESOURCE_URIS = ["membase://profile", "membase://recent"];
// The literal tag every client's handoff store/recall convention shares.
const HANDOFF_TAG = "[HANDOFF]";
// The client source values pillar-1 hook capture tags memories with.
const CAPTURE_SOURCES = ["cursor", "codex", "claude-code", "hermes", "openclaw"];

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
          await evalResources(ctx, url); // Tier 3 (MCP resources: membase://profile, membase://recent)
          await evalFilters(ctx, url, fast.roles); // Tier 3 (search_memory/search_wiki filter params)
          await evalHandoff(ctx); // Tier 3 (handoff store→recall round-trip, REST path)
          await evalHandoffReplace(ctx); // Tier 3 (handoff replace-on-store: old handoff actually deleted)
          await evalCaptureSourceTags(ctx); // Tier 3 (hook-capture source tagging + isolation, REST path)
          await evalNegative(ctx, url, fast.roles); // Tier 3 (rejection behavior)
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
  // Per-run project tag: test memories are never deleted on staging (no
  // delete-memory tool), so every past run leaves a semantically identical
  // "launch codeword" memory behind. Without a unique tag the Tier 3 context
  // query competes against all of them and the newest sentinel falls out of
  // the top-N as runs accumulate. Independent of the sentinel so the query
  // still never contains the answer string.
  entry.projectTag = `Testland-${Math.floor(Math.random() * 1e9).toString(36)}`;

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
    args: argsFor(roles.remember, { primary: `[e2e-test] The secret launch codeword for project ${entry.projectTag} is ${sentinel}. (safe to delete)` })
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

  // 2. get_current_date returns an actual, sane, parseable date. Beyond the
  // format regex: parses to a real calendar date within +/-2 days of this
  // machine's wall clock (loose enough for timezone offset, tight enough to
  // catch a stuck/mocked date), and repeated calls agree with each other —
  // this is the anchor every relative-date memory query (search_memory
  // date_from/date_to, "today"/"yesterday") is built on.
  if (names.has("get_current_date")) {
    const d = await call("get_current_date", {}, 50);
    const dateMatch = (d.raw ?? "").match(/\d{4}-\d{2}-\d{2}/);
    const hasDate = Boolean(dateMatch);
    entry.checks.push(check(
      "contract: get_current_date returns a date",
      !d.payload?.error && d.status < 400 && hasDate,
      hasDate ? "ISO date present" : errText(d) || "no date in response"
    ));
    if (hasDate) {
      const parsed = new Date(dateMatch[0]);
      const diffDays = Math.abs(parsed.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      const sane = !Number.isNaN(parsed.getTime()) && diffDays <= 2;
      entry.checks.push(check(
        "contract: get_current_date is within 2 days of wall clock",
        sane,
        sane ? `${dateMatch[0]} (Δ${diffDays.toFixed(2)}d)` : `${dateMatch[0]} is Δ${diffDays.toFixed(2)}d from now — stuck/mocked date?`
      ));

      const d2 = await call("get_current_date", {}, 50);
      const dateMatch2 = (d2.raw ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
      entry.checks.push(check(
        "contract: get_current_date is stable across repeated calls",
        dateMatch2 === dateMatch[0],
        dateMatch2 === dateMatch[0] ? "consistent" : `first=${dateMatch[0]} second=${dateMatch2}`
      ));
    }
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

// ---------- Tier 3: MCP resources (membase://profile, membase://recent) ----------
// The harness only ever spoke tools/list + tools/call — resources/list and
// resources/read were never implemented in mcp-client.mjs, so this real
// client-facing surface (Claude's SessionStart prefetch reads both; the
// membase MCP usage instructions tell every client when to read them) has
// never been exercised live. apps/mcp/src/resources.ts registers exactly two
// resources: membase://profile (JSON: display_name/role/interests/
// instructions/timezone, backed by GET /user/settings) and membase://recent
// (text/markdown starting with "# Membase Recent Memories", backed by an
// empty-query search_memory). Basis for the two URIs and shapes: apps/mcp/
// src/resources.ts and resources/{profile,recent}.ts in the membase backend.
async function evalResources(entry, url) {
  const sessionId = entry.sessionId;

  const list = await listResources(url, { token: TOKEN, sessionId, id: 90 });
  const uris = new Set((list.payload?.result?.resources ?? []).map((r) => r.uri));
  entry.checks.push(check(
    "resources: resources/list exposes membase://profile and membase://recent",
    !list.payload?.error && EXPECTED_RESOURCE_URIS.every((u) => uris.has(u)),
    list.payload?.error ? errText(list) : `found: ${[...uris].join(", ") || "none"}`
  ));

  const profile = await readResource(url, { token: TOKEN, sessionId, uri: "membase://profile", id: 91 });
  const profileContent = profile.payload?.result?.contents?.[0];
  let profileParsed;
  try {
    profileParsed = profileContent?.text ? JSON.parse(profileContent.text) : undefined;
  } catch {
    profileParsed = undefined;
  }
  const profileOk =
    !profile.payload?.error &&
    profileContent?.mimeType === "application/json" &&
    profileParsed !== undefined &&
    "timezone" in profileParsed;
  entry.checks.push(check(
    "resources: membase://profile reads as JSON with expected shape",
    profileOk,
    profileOk ? "application/json with timezone field present" : (errText(profile) || `unexpected content: ${JSON.stringify(profileContent).slice(0, 100)}`)
  ));

  const recent = await readResource(url, { token: TOKEN, sessionId, uri: "membase://recent", id: 92 });
  const recentContent = recent.payload?.result?.contents?.[0];
  const recentOk =
    !recent.payload?.error &&
    recentContent?.mimeType === "text/markdown" &&
    (recentContent.text ?? "").startsWith("# Membase Recent Memories");
  entry.checks.push(check(
    "resources: membase://recent reads as markdown with expected header",
    recentOk,
    recentOk ? "text/markdown starting with the recent-memories header" : (errText(recent) || `unexpected content: ${JSON.stringify(recentContent).slice(0, 100)}`)
  ));

  // Negative: an unregistered URI must error, not silently return empty content.
  const bogus = await readResource(url, { token: TOKEN, sessionId, uri: "membase://not-a-real-resource", id: 93 });
  const bogusRejected = Boolean(bogus.payload?.error) || bogus.status >= 400;
  entry.checks.push(check(
    "resources: reading an unregistered URI errors rather than returning empty content",
    bogusRejected,
    bogusRejected ? (errText(bogus) || `HTTP ${bogus.status}`) : "unregistered URI returned a response without error"
  ));
}

// ---------- Tier 3: search_memory/search_wiki filter params (project/sources/date) ----------
// Basis: this repo's own MCP server-usage instructions document `project`
// (exact-slug scope), `sources` (origin filter), and `date_from`/`date_to`
// (ISO 8601 range) as real search_memory params, and `project` on add_wiki/
// search_wiki. Nothing elsewhere in this suite ever asserts the live server
// actually applies these filters (only that add/search work at all) — this
// proves it, including that project scoping doesn't leak across tags.
async function evalFilters(entry, url, roles) {
  const sessionId = entry.sessionId;
  const call = (name, args, id) => callTool(url, { token: TOKEN, sessionId, id, name, args });

  // project filter on search_memory: two memories tagged with different
  // project slugs: search scoped to A must not surface B's sentinel.
  const stamp = Date.now();
  const projectA = `e2e-proj-a-${stamp}`;
  const projectB = `e2e-proj-b-${stamp}`;
  const sentinelA = `membase-e2e-filter-a-${stamp}`;
  const sentinelB = `membase-e2e-filter-b-${stamp}`;

  const addA = await call(roles.remember.name, argsFor(roles.remember, { primary: `[e2e-filter] ${sentinelA}` }, { project: projectA }), 70);
  const addB = await call(roles.remember.name, argsFor(roles.remember, { primary: `[e2e-filter] ${sentinelB}` }, { project: projectB }), 71);
  const bothStored = !addA.payload?.error && !addB.payload?.error;
  entry.checks.push(check("filters: two project-tagged memories stored", bothStored, bothStored ? "stored" : `${errText(addA)} / ${errText(addB)}`));
  if (!bothStored) return;

  // Async indexing: poll project-scoped search for sentinelA up to the same
  // recall SLO used elsewhere, then check sentinelB is absent from that result.
  let scoped;
  const t0 = now();
  while (true) {
    scoped = await call(roles.search.name, argsFor(roles.search, { primary: sentinelA }, { project: projectA }), 72);
    if ((scoped.raw ?? "").includes(sentinelA)) break;
    if (now() - t0 + RECALL_POLL_INTERVAL_MS > QUALITY_MAX_RECALL_MS) break;
    await new Promise((res) => setTimeout(res, RECALL_POLL_INTERVAL_MS));
  }
  const foundOwn = (scoped.raw ?? "").includes(sentinelA);
  entry.checks.push(check(
    `filters: project=A search finds A's memory within ${QUALITY_MAX_RECALL_MS / 1000}s`,
    foundOwn,
    foundOwn ? "found" : "not searchable within SLO"
  ));
  if (foundOwn) {
    const leaked = (scoped.raw ?? "").includes(sentinelB);
    entry.checks.push(check("filters: project=A search excludes B's memory", !leaked, leaked ? "LEAK: B's sentinel returned under project=A" : "excluded"));
  }

  // date_from/date_to: a window covering [24h ago, now] must include the
  // just-written memory; a window ending 1s before it was written must
  // exclude it. Uses the same query text (sentinelA) so only the date window
  // varies between the two calls. `stamp` is Date.now()-based (wall clock);
  // `now()`/`t0` above is performance.now() (monotonic) and not comparable to it.
  const nowIso = new Date().toISOString();
  const past = new Date(stamp - 24 * 60 * 60 * 1000).toISOString();
  const before = new Date(stamp - 1000).toISOString();

  const withinWindow = await call(roles.search.name, argsFor(roles.search, { primary: sentinelA }, { date_from: past, date_to: nowIso }), 73);
  entry.checks.push(check(
    "filters: date_from/date_to including now finds recent memory",
    !withinWindow.payload?.error && (withinWindow.raw ?? "").includes(sentinelA),
    !withinWindow.payload?.error ? ((withinWindow.raw ?? "").includes(sentinelA) ? "found" : "not found in window") : errText(withinWindow)
  ));

  const outsideWindow = await call(roles.search.name, argsFor(roles.search, { primary: sentinelA }, { date_from: past, date_to: before }), 74);
  const excludedPast = !(outsideWindow.raw ?? "").includes(sentinelA);
  entry.checks.push(check(
    "filters: date_to before write excludes the memory",
    !outsideWindow.payload?.error && excludedPast,
    outsideWindow.payload?.error ? errText(outsideWindow) : (excludedPast ? "excluded" : "LEAK: found outside date window")
  ));

  // sources filter: an out-of-band source (e.g. "slack") must not surface a
  // memory written via the MCP tool call path (which has no source tag).
  const wrongSource = await call(roles.search.name, argsFor(roles.search, { primary: sentinelA }, { sources: ["slack"] }), 75);
  const notLeakedViaSource = !(wrongSource.raw ?? "").includes(sentinelA);
  entry.checks.push(check(
    "filters: sources=[slack] excludes an MCP-written memory",
    !wrongSource.payload?.error && notLeakedViaSource,
    wrongSource.payload?.error ? errText(wrongSource) : (notLeakedViaSource ? "excluded" : "LEAK: found under unrelated source filter")
  ));

  // search_wiki project scoping, mirroring the memory check above.
  const names = new Set((await listTools(url, { token: TOKEN, sessionId })).payload?.result?.tools?.map((t) => t.name) ?? []);
  if (names.has("add_wiki") && names.has("search_wiki")) {
    const wikiStamp = `e2e-wiki-filter-${stamp}`;
    const wikiProject = `e2e-wiki-proj-${stamp}`;
    const addWiki = await call("add_wiki", { title: `[e2e-filter] ${wikiStamp}`, content: `Filter-test wiki body ${wikiStamp}.`, project: wikiProject }, 76);
    const wikiOk = !addWiki.payload?.error && addWiki.status < 400;
    entry.checks.push(check("filters: add_wiki with project stores the doc", wikiOk, wikiOk ? "stored" : errText(addWiki)));
    if (wikiOk) {
      const docId = (addWiki.raw ?? "").match(UUID_RE)?.[0];
      let wikiFound = false;
      for (const delay of [0, 3000, 8000]) {
        if (delay) await new Promise((res) => setTimeout(res, delay));
        const s = await call("search_wiki", { query: wikiStamp, project: wikiProject }, 77);
        if ((s.raw ?? "").includes(wikiStamp)) { wikiFound = true; break; }
      }
      entry.checks.push(check("filters: search_wiki project scope finds the doc", wikiFound, wikiFound ? "found" : "not searchable within ~11s"));
      if (docId) await call("delete_wiki", { doc_id: docId }, 78); // cleanup, best-effort
    }
  } else {
    entry.checks.push(warn("filters: search_wiki project scoping skipped", "add_wiki/search_wiki not both exposed"));
  }
}

// ---------- Tier 3: handoff store→recall round-trip (REST ingest/search) ----------
// Regression guard for the membase_handoff tool (clients/*/runtime). The tool
// tags a handoff with a literal "[HANDOFF]" prefix and, on recall, filters
// search results by that prefix on the episode NAME/SUMMARY (the bundle does
// not carry the raw content body). The backend derives the episode name from
// display_summary (graph_sync build_safe_episode_name), so the tag MUST be
// placed on display_summary — not just the content — or recall silently finds
// nothing. This test asserts that contract end-to-end against the live REST
// path the runtime actually uses. Runs once per endpoint under --tier3.
async function evalHandoff(entry) {
  const restBase = REST_API_BASE.replace(/\/$/, "");
  const stamp = `e2e-handoff-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const summary = `Handoff round-trip sentinel ${stamp}. (safe to delete)`;
  const authedFetch = (path, init) =>
    fetch(`${restBase}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  // Store the way the runtime does: tag lives on BOTH content and
  // display_summary so the derived episode name carries it.
  const ingestBody = {
    content: `${HANDOFF_TAG} ${summary}`,
    display_summary: `${HANDOFF_TAG} ${summary}`,
    source: "openclaw",
    channel: "api",
  };
  let stored = false;
  try {
    const res = await authedFetch("/memory/ingest", {
      method: "POST",
      body: JSON.stringify(ingestBody),
    });
    stored = res.status < 400;
    if (!stored) {
      entry.checks.push(check("handoff: ingest accepted", false, `HTTP ${res.status}`));
      return;
    }
  } catch (err) {
    entry.checks.push(check("handoff: ingest accepted", false, String(err?.message ?? err)));
    return;
  }
  entry.checks.push(check("handoff: ingest accepted", true, "stored via /memory/ingest"));

  // Recall: poll search until the handoff is indexed, then assert the tag
  // survived into the field recall inspects (episode.name / summary). This is
  // the exact check the runtime's isHandoffMemory does — if the tag only lived
  // in content, name/summary would not start with [HANDOFF] and this fails.
  const t0 = now();
  let recalled = null;
  while (now() - t0 < QUALITY_MAX_RECALL_MS) {
    try {
      const res = await authedFetch(
        `/memory/search?query=${encodeURIComponent(`${HANDOFF_TAG} session handoff summary`)}&limit=20&format=bundles`,
      );
      if (res.status < 400) {
        const data = await res.json();
        const episodes = data?.episodes ?? [];
        recalled = episodes.find((b) => {
          const name = b?.episode?.name ?? "";
          const sum = b?.episode?.summary ?? "";
          return (
            (name.trimStart().startsWith(HANDOFF_TAG) ||
              sum.trimStart().startsWith(HANDOFF_TAG)) &&
            (name.includes(stamp) || sum.includes(stamp))
          );
        });
        if (recalled) break;
      }
    } catch {
      // transient; keep polling to the deadline
    }
    if (now() - t0 + RECALL_POLL_INTERVAL_MS > QUALITY_MAX_RECALL_MS) break;
    await new Promise((res) => setTimeout(res, RECALL_POLL_INTERVAL_MS));
  }
  const ttr = ((now() - t0) / 1000).toFixed(1);
  entry.checks.push(check(
    "handoff: recall finds the [HANDOFF]-tagged episode by name/summary",
    Boolean(recalled),
    recalled
      ? `tag survived into episode.name/summary after ~${ttr}s`
      : `no [HANDOFF] episode with sentinel found within ${QUALITY_MAX_RECALL_MS / 1000}s — tag likely not on name/summary`,
  ));
}

// ---------- Tier 3: handoff replace-on-store (REST ingest/search/delete) ----------
// North-star pillar 2 policy (exactly ONE handoff per project — replace-on-
// store, see packages/capture-core/src/handoff.ts's sweepReplacedHandoffs):
// storing a new [HANDOFF] must search for the prior one, then DELETE it. This
// is the one piece of that contract evalHandoff (above) never exercises — it
// only proves store+recall, never that a second store deletes the first.
// That gap existed because the MCP tool surface has no delete tool (see
// evalNegative/evalLiveDeep's "forget" warnings) — but the runtime's real
// delete path is a REST call, `DELETE /memory/episodes/{episode_uuid}`
// (apps/api/src/api/routes/memory.py), the same one Claude/OpenClaw/Hermes's
// deleteEpisode/deleteMemory call. This test drives that exact contract:
// ingest A -> search finds A's episode.uuid -> DELETE that uuid -> ingest B
// (replacement) -> search confirms A is gone and B is present. Scoped to a
// unique project tag so it never collides with evalHandoff's untagged run or
// real handoffs on the test account.
async function evalHandoffReplace(entry) {
  const restBase = REST_API_BASE.replace(/\/$/, "");
  const authedFetch = (path, init) =>
    fetch(`${restBase}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  const stamp = Date.now();
  const project = `e2e-handoff-replace-${stamp}`;
  const sentinelA = `e2e-handoff-replace-a-${stamp}`;
  const sentinelB = `e2e-handoff-replace-b-${stamp}`;

  const ingest = async (sentinel) => {
    const body = {
      content: `${HANDOFF_TAG} Replace-on-store test ${sentinel}. (safe to delete)`,
      display_summary: `${HANDOFF_TAG} Replace-on-store test ${sentinel}. (safe to delete)`,
      source: "openclaw",
      channel: "api",
      project,
    };
    const res = await authedFetch("/memory/ingest", { method: "POST", body: JSON.stringify(body) });
    return res.status < 400;
  };

  // find the episode bundle for a given sentinel, polling to the recall SLO.
  const findEpisode = async (sentinel) => {
    const t0 = now();
    while (true) {
      try {
        const res = await authedFetch(
          `/memory/search?query=${encodeURIComponent(HANDOFF_TAG)}&limit=20&format=bundles&project=${encodeURIComponent(project)}`
        );
        if (res.status < 400) {
          const data = await res.json();
          const episodes = data?.episodes ?? [];
          const hit = episodes.find((b) => {
            const name = b?.episode?.name ?? "";
            const sum = b?.episode?.summary ?? "";
            return name.includes(sentinel) || sum.includes(sentinel);
          });
          if (hit) return hit;
        }
      } catch {
        // transient; keep polling to the deadline
      }
      if (now() - t0 + RECALL_POLL_INTERVAL_MS > QUALITY_MAX_RECALL_MS) return null;
      await new Promise((res) => setTimeout(res, RECALL_POLL_INTERVAL_MS));
    }
  };

  const storedA = await ingest(sentinelA);
  entry.checks.push(check("handoff replace: first ingest (A) accepted", storedA, storedA ? "stored" : "ingest rejected"));
  if (!storedA) return;

  const episodeA = await findEpisode(sentinelA);
  entry.checks.push(check(
    `handoff replace: recall finds A's episode within ${QUALITY_MAX_RECALL_MS / 1000}s`,
    Boolean(episodeA),
    episodeA ? `uuid=${short(episodeA.episode?.uuid ?? "")}` : "not found within SLO"
  ));
  if (!episodeA?.episode?.uuid) return;

  // Replicate the runtime's replace-on-store: ingest the replacement (B)
  // FIRST, then delete the prior handoff (A) — matching sweepReplacedHandoffs'
  // "ingest -> sweep old" ordering (store.ts:replaceHandoff), not delete-first.
  const storedB = await ingest(sentinelB);
  entry.checks.push(check("handoff replace: second ingest (B, the replacement) accepted", storedB, storedB ? "stored" : "ingest rejected"));
  if (!storedB) return;

  let deleteOk = false;
  let deleteDetail = "";
  try {
    const del = await authedFetch(`/memory/episodes/${encodeURIComponent(episodeA.episode.uuid)}`, { method: "DELETE" });
    deleteOk = del.status === 204;
    deleteDetail = deleteOk ? "204 No Content" : `HTTP ${del.status}`;
  } catch (err) {
    deleteDetail = String(err?.message ?? err);
  }
  entry.checks.push(check("handoff replace: DELETE /memory/episodes/{uuid} on the old handoff succeeds", deleteOk, deleteDetail));
  if (!deleteOk) return;

  // Confirm the swap: A gone, B present. Poll since delete-then-reindex is
  // also async; failure to disappear within the SLO is a real regression
  // (replace-on-store's whole point is exactly one handoff per project).
  const t0 = now();
  let aGone = false;
  let bPresent = false;
  while (true) {
    const stillA = await findEpisode(sentinelA);
    const stillB = await findEpisode(sentinelB);
    aGone = !stillA;
    bPresent = Boolean(stillB);
    if (aGone && bPresent) break;
    if (now() - t0 + RECALL_POLL_INTERVAL_MS > QUALITY_MAX_RECALL_MS) break;
    await new Promise((res) => setTimeout(res, RECALL_POLL_INTERVAL_MS));
  }
  entry.checks.push(check(
    "handoff replace: old handoff (A) no longer searchable after delete",
    aGone,
    aGone ? "gone" : "STALE: A still searchable after delete — replace-on-store is leaking old handoffs"
  ));
  entry.checks.push(check(
    "handoff replace: replacement (B) remains searchable",
    bPresent,
    bPresent ? "present" : "B not found — search regressed independent of the delete"
  ));
}

// ---------- Tier 3: hook-capture source tagging (REST ingest, per client) ----------
// North-star pillar 1 (hook-based passive capture): every client's hook
// eventually flushes its spool via a real POST to the same REST ingest
// endpoint this harness already drives (packages/capture-core/src/spool.ts
// flushSpool -> client.ingest). This suite cannot fire an actual hook process
// (that needs each client app running) — what it CAN and previously did not
// prove is the shared backend contract every hook flush depends on: a memory
// tagged with a given client's `source` is accepted, and `sources=[...]`
// filtering actually isolates one client's captures from another's. If this
// contract breaks, every client's hook capture breaks silently right along
// with it, so it is the highest-leverage piece of pillar 1 a network-only
// harness can verify. Client-side hook firing itself needs a live per-app
// run (see docs/implementation-overview.html §7.5-style gap notes).
async function evalCaptureSourceTags(entry) {
  const restBase = REST_API_BASE.replace(/\/$/, "");
  const authedFetch = (path, init) =>
    fetch(`${restBase}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  const stamp = Date.now();
  const project = `e2e-capture-src-${stamp}`;
  const sentinelFor = (source) => `e2e-capture-${source}-${stamp}`;

  const results = {};
  for (const source of CAPTURE_SOURCES) {
    const sentinel = sentinelFor(source);
    const body = {
      content: `[e2e-capture] hook-flush simulation for ${source}: ${sentinel}. (safe to delete)`,
      source,
      channel: "api",
      project,
    };
    try {
      const res = await authedFetch("/memory/ingest", { method: "POST", body: JSON.stringify(body) });
      results[source] = res.status < 400;
    } catch {
      results[source] = false;
    }
  }
  const allStored = CAPTURE_SOURCES.every((s) => results[s]);
  entry.checks.push(check(
    "capture: ingest accepts every client's source tag",
    allStored,
    allStored ? `stored: ${CAPTURE_SOURCES.join(", ")}` : `failed: ${CAPTURE_SOURCES.filter((s) => !results[s]).join(", ")}`
  ));
  if (!allStored) return;

  // Poll until cursor's own sentinel is searchable scoped to its source, then
  // check every OTHER client's sentinel is excluded from that same query —
  // proves sources=[...] actually isolates one client's captures from
  // another's, which is exactly what a hook flush relies on to not have its
  // captures blended with a different client's.
  const primary = "cursor";
  const t0 = now();
  let ownFound = false;
  let raw = "";
  while (true) {
    const res = await authedFetch(
      `/memory/search?query=${encodeURIComponent("[e2e-capture]")}&limit=20&sources=${primary}&project=${encodeURIComponent(project)}`
    );
    raw = res.status < 400 ? await res.text() : "";
    if (raw.includes(sentinelFor(primary))) { ownFound = true; break; }
    if (now() - t0 + RECALL_POLL_INTERVAL_MS > QUALITY_MAX_RECALL_MS) break;
    await new Promise((res2) => setTimeout(res2, RECALL_POLL_INTERVAL_MS));
  }
  entry.checks.push(check(
    `capture: sources=[${primary}] finds ${primary}'s own memory within ${QUALITY_MAX_RECALL_MS / 1000}s`,
    ownFound,
    ownFound ? "found" : "not searchable within SLO"
  ));
  if (ownFound) {
    const others = CAPTURE_SOURCES.filter((s) => s !== primary);
    const leaked = others.filter((s) => raw.includes(sentinelFor(s)));
    entry.checks.push(check(
      `capture: sources=[${primary}] excludes other clients' memories`,
      leaked.length === 0,
      leaked.length === 0 ? "isolated" : `LEAK: ${leaked.join(", ")} sentinel(s) returned under sources=[${primary}]`
    ));
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
    args: argsFor(roles.getContext ?? roles.search, { primary: `What is the launch codeword for project ${entry.projectTag}?` })
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
    // search p95 is a pure server-load signal, not a code property — staging
    // p95 swings from ~0.8s to ~4.7s run-to-run, so a hard fail here is flaky
    // and blocks unrelated PRs. Surface a slow p95 as a WARN (not a run
    // failure); recall correctness / semantic context above stay hard gates.
    const within = entry.latency.search_p95 <= QUALITY_MAX_SEARCH_P95_MS;
    entry.checks.push(
      within
        ? check(`quality gate: search p95 ≤ ${QUALITY_MAX_SEARCH_P95_MS}ms`, true, `search p95=${entry.latency.search_p95}ms`)
        : warn(`search p95 above ${QUALITY_MAX_SEARCH_P95_MS}ms (staging load, not a code regression)`, `search p95=${entry.latency.search_p95}ms`)
    );
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
async function evalNegative(entry, url, roles) {
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

  // Unknown mcp-session-id + a VALID bearer token: confirmed by design (not a
  // gap) that the server auto-reinitializes a fresh session bound to the
  // token's own userId rather than rejecting outright — many MCP clients
  // handle a stale-session 404 poorly, so this recovers transparently
  // instead. session-id is a connection-continuity id, not a second
  // credential; Bearer auth is the actual security boundary. What DOES matter
  // is that the forged id can't smuggle in someone else's identity/data — so
  // this checks the write actually lands under THIS token's own account
  // (searchable via this token), not that the call is rejected.
  const sessionSentinel = `e2e-negative-session-${Date.now()}`;
  const badSession = await callTool(url, {
    token: TOKEN, sessionId: "e2e-forged-session-id-00000000", id: 63,
    name: "add_memory", args: { content: `[e2e-negative] forged-session write ${sessionSentinel}` }
  });
  const badSessionAccepted = !badSession.payload?.error && badSession.status < 400;
  entry.checks.push(check(
    "negative: unknown mcp-session-id + valid token auto-reinitializes (not rejected — by design)",
    badSessionAccepted,
    badSessionAccepted ? `HTTP ${badSession.status}` : errText(badSession) || `HTTP ${badSession.status}`
  ));
  if (badSessionAccepted && roles?.search) {
    // Same async-indexing wait as every other recall check in this suite
    // (e.g. evalLiveDeep's recall@1 observed ~26-32s on staging) — the
    // previous [0, 3000, 8000] backoff (~11s max) was too short and made
    // this flaky-fail as "write lost", not a real regression.
    let landedUnderThisToken = false;
    const t0 = now();
    while (true) {
      const s = await callTool(url, {
        token: TOKEN, sessionId: entry.sessionId, id: 64,
        name: roles.search.name, args: argsFor(roles.search, { primary: sessionSentinel })
      });
      if ((s.raw ?? "").includes(sessionSentinel)) { landedUnderThisToken = true; break; }
      if (now() - t0 + RECALL_POLL_INTERVAL_MS > QUALITY_MAX_RECALL_MS) break;
      await new Promise((res) => setTimeout(res, RECALL_POLL_INTERVAL_MS));
    }
    entry.checks.push(check(
      `negative: forged-session write lands under the token's own account within ${QUALITY_MAX_RECALL_MS / 1000}s (no identity smuggling)`,
      landedUnderThisToken,
      landedUnderThisToken ? "found under this token's own search" : "not found within SLO — write may be lost or misattributed"
    ));
  }

  // Oversized content — 200KB of text is well beyond any real memory/note and
  // should be rejected as a validation error, not silently truncated/stored
  // (silent truncation would be a data-loss bug, not caught elsewhere).
  const oversized = "e2e-oversized-payload-".repeat(10000); // ~230KB
  const big = await callTool(url, { token: TOKEN, sessionId, id: 67, name: "add_memory", args: { content: oversized } });
  const bigRejected = toolErrored(big) || big.status === 413 || big.status >= 400;
  entry.checks.push(check(
    "negative: oversized (~230KB) add_memory content → rejected",
    bigRejected,
    bigRejected ? (textOf(big.payload) || `HTTP ${big.status}`).slice(0, 80) : "accepted a 230KB payload without error"
  ));

  // Concurrent tools/call on one session — responses must not cross-wire
  // (each JSON-RPC id must come back matched to its own request).
  const [concA, concB] = await Promise.all([
    callTool(url, { token: TOKEN, sessionId, id: 68, name: "get_current_date", args: {} }),
    callTool(url, { token: TOKEN, sessionId, id: 69, name: "get_current_date", args: {} })
  ]);
  const idsMatch = concA.payload?.id === 68 && concB.payload?.id === 69;
  const bothOk = !concA.payload?.error && !concB.payload?.error;
  entry.checks.push(check(
    "negative: concurrent tools/call on one session don't cross-wire responses",
    idsMatch && bothOk,
    idsMatch ? "response ids matched requests" : `id mismatch: got ${concA.payload?.id}/${concB.payload?.id}, expected 68/69`
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

// extra: optional filter params (project/sources/date_from/date_to) to merge
// in verbatim — these are documented search_memory/add_wiki/search_wiki
// params that are rarely "required" in the schema, so they must bypass the
// required-props loop below to actually reach the tool call.
function argsFor(tool, { primary, id }, extra) {
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
  if (extra) Object.assign(args, extra);
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
