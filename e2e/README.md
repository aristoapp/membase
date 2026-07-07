# Connector E2E Verification & Eval

End-to-end harness that verifies each client connector against the **live**
Membase MCP server and evaluates quality and latency. Dependency-free (Node 18+
`fetch`). This is the runnable implementation of `docs/live-smoke-runbook.md`.

## Tiers

**Tier 1 — reachability + protocol + discovery (no credentials).** Runs now.

```bash
pnpm e2e
```

For every committed client MCP config it proves the configured endpoint is a
live, spec-compliant, correctly-secured MCP server:

- OAuth protected-resource discovery (RFC 9728) is reachable and its `resource`
  matches the configured URL, with `authorization_servers` = `api.membase.so`.
- An MCP `initialize` handshake reaches the server and is correctly OAuth-gated
  (`401` + `WWW-Authenticate: Bearer resource_metadata=...`).
- Per-step latency is measured.

Stdio clients (Claude) are config-validated only — the bundled server ships in
the Claude plugin repo, so its live run belongs in that repo's e2e.

**Tier 2 — fast live smoke (needs a token).** Merge-gate speed (~seconds).

```bash
MEMBASE_MCP_TOKEN="<oauth-access-token>" pnpm e2e:live
```

Proves the authed surface works, without waiting on async indexing:

- `tools/list` exposes remember + search (getContext / forget absences are warned).
- **remember** is accepted (storage acknowledged).
- **search** endpoint responds without error (recall *correctness* is Tier 3).

**Tier 3 — deep lifecycle + quality/latency eval (needs a token).** Minutes-long;
for nightly runs. Runs Tier 2, then the slow correctness/quality half:

```bash
MEMBASE_MCP_TOKEN="<oauth-access-token>" node e2e/run-e2e.mjs --tier3
```

- **recall@1**: polls **search** for the sentinel with indexing backoff and
  records write→searchable time + search p50/p95.
- **getContext** (semantic retrieval) returns the sentinel memory.
- **forget** removes the memory (when the server exposes a delete tool).
- **tool contract**: asserts every expected tool is exposed (basis: the shipped
  tool surface — `add_memory`, `search_memory`, `get_current_date`,
  `search_wiki`, `add_wiki`, `update_wiki`, `delete_wiki`; a missing tool fails
  the run), that `get_current_date` returns a date that's sane (within 2 days
  of wall clock) and stable across repeated calls, and runs a full wiki CRUD
  round-trip (add → search → update → delete → confirm gone) that cleans up
  after itself.
- **MCP resources**: `resources/list` exposes `membase://profile` and
  `membase://recent`, and `resources/read` returns the expected shape for
  each — `membase://profile` as `application/json` with a `timezone` field,
  `membase://recent` as `text/markdown` starting with `# Membase Recent
  Memories`. Also confirms reading an unregistered URI errors rather than
  returning empty content. This is real client-facing surface (the membase
  MCP usage instructions tell every client when to read these) that the
  harness previously couldn't reach at all — `mcp-client.mjs` only spoke
  `tools/list`/`tools/call` until `resources/list`/`resources/read` were
  added alongside this check.
- **filter params**: `search_memory`'s `project`, `sources`, and
  `date_from`/`date_to` filters, and `add_wiki`/`search_wiki`'s `project`
  scoping — two project-tagged memories are written and a `project`-scoped
  search must return its own memory and exclude the other's; a `date_to`
  window ending before the write must exclude it; `sources=["slack"]` must
  exclude a memory written via the MCP tool call path. Previously only the
  add/search happy path was checked — never whether the live server actually
  applies these documented filters.
- **quality gates**: hard pass/fail on measured quality — memory must become
  searchable within `MEMBASE_E2E_MAX_RECALL_MS` (correctness ceiling, default
  180s; slower than `MEMBASE_E2E_TARGET_RECALL_MS` (default 60s) only warns),
  semantic context must retrieve the sentinel, and search p95 ≤
  `MEMBASE_E2E_MAX_SEARCH_P95_MS` (default 3000ms).
- **negative cases**: no token → 401 Bearer, forged token → 401, malformed
  tool calls (missing/empty required arg, unknown tool) → tool-level error, an
  oversized (~230KB) `add_memory` content → rejected rather than silently
  truncated, and two concurrent `tools/call`s on one session → responses
  don't cross-wire (each JSON-RPC id comes back matched to its own request).
  An unknown `mcp-session-id` + a valid Bearer token is confirmed (against
  the live server's own code, not assumed) to auto-reinitialize a fresh
  session bound to that token's own userId rather than being rejected — by
  design, since session-id is a continuity id, not a second credential — so
  the check instead confirms the forged-session write lands under the
  token's own account, not that the call is refused.
- **handoff replace-on-store** (north-star pillar 2): the "exactly one
  handoff per project" policy (`packages/capture-core/src/handoff.ts`'s
  `sweepReplacedHandoffs`) means storing a new `[HANDOFF]` must delete the
  prior one. The MCP tool surface has no delete tool, but the runtime's real
  delete path is REST (`DELETE /memory/episodes/{episode_uuid}`) — this test
  ingests handoff A, recovers its episode UUID via search, ingests
  replacement B, deletes A by UUID, then confirms search shows A gone and B
  present. Previously only store→recall was proven (`evalHandoff`); never
  that a second store actually deletes the first.
- **hook-capture source tagging** (north-star pillar 1): every client's hook
  eventually flushes its spool via a POST to this same REST ingest endpoint
  (`packages/capture-core/src/spool.ts`'s `flushSpool`). This harness cannot
  fire an actual hook process (that needs each client app running — see
  `docs/implementation-overview.html` §7.5 for that gap), but it proves the
  shared backend contract every hook flush depends on: a memory tagged with
  each client's `source` (`cursor`, `codex`, `claude-code`, `hermes`,
  `openclaw`) is accepted, and `sources=[...]` filtering isolates one
  client's captures from another's.

Obtain the token through the client's normal OAuth flow, or set
`MEMBASE_SERVICE_CLIENT_ID`/`MEMBASE_SERVICE_CLIENT_SECRET` for a
`client_credentials` service token (CI). Target staging/preview by also setting
`MEMBASE_AUTH_BASE` + `MEMBASE_MCP_URL`. Use a test-only account; the harness
tags its data with a unique sentinel.

## Output

A per-client scorecard (pass/fail checks, latency, quality metrics) and a
`k/N clients passed` summary. Exit code is non-zero if any client fails its
tier's checks.

## Scope

Live-network + credential-gated, so it is intentionally **not** part of
`pnpm check`. Run it manually or in a scheduled/CI job that can hold a
test-only Membase token.
