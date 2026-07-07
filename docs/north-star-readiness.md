# North-Star Readiness — Deprecating the Standalone Connector Repos

Tracks the final gate before `MEM-332` executes: everything the four standalone
repos (`claude-membase`, `cursor-membase`, `hermes-membase`, `openclaw-membase`)
provide now lives in this repo. **Publishing and archiving stay frozen until
BOTH the automated verification below is green AND Jaehwan has signed off on
the manual checks.** This is a deliberate two-key gate.

## What "everything is in" means (as of consolidation Group C)

| Client | Runtime home in this repo | Coverage |
| --- | --- | --- |
| Claude | `clients/claude/runtime` (commands, hooks, skills, agent, bundled stdio MCP server `plugin/scripts/mcp-server.cjs`, TS source, tests) | typecheck + bun tests in CI; `claude:native-artifacts` asserts ported inventory |
| Cursor | `clients/cursor/{rules,skills,assets,CHANGELOG.md}` (static artifacts; remote HTTP MCP) | `cursor:native-artifacts` asserts ported inventory |
| Codex | `clients/codex` (net-new adapter, Group A) | smoke + e2e |
| Hermes | `clients/hermes/python` (provider, OAuth incl. headless client_credentials, capture, mirror, CLI, installer, tests) | unittest suite in CI; parity + native-artifact guards |
| OpenClaw | `clients/openclaw/runtime` (plugin runtime: client, hooks, tools, commands, manifest, tests) | typecheck + bun tests in CI; native-artifact guards |

Deliberately NOT done yet (post-launch): shared-core dedupe of the three
copied runtimes; publishing (npm/PyPI/marketplaces); archiving old repos.

## Gate 1 — automated (AI-verifiable, rerun any time)

- [x] `pnpm check` green on `main` (includes all parity/native guards and
  runtime typechecks). — 2026-07-05, main `5464c2a`.
- [x] CI green on `main`: hermes unittests, claude + openclaw bun tests,
  `pnpm smoke:execute`, e2e Tier 1 + Tier 2. — 2026-07-05.
- [x] e2e Tier 3 (deep quality) green against staging:
  `gh workflow run e2e-staging.yml --ref main -f tier=3`. — 2026-07-05, run
  28756530682 (all 5 clients). Note: a first run failed ONLY the search-p95
  gate (staging cold start inflates p95); rerun once before escalating a
  p95-only failure.
- [x] Live OpenClaw integration verified on a real gateway (plugin loads from
  this repo, `membase_search`/`membase_search_wiki` return results). —
  2026-07-05, Mac gateway + @jaehwanlee_mac_bot; `add_wiki` write path also
  verified (doc later read back from Claude Code).

## Gate 2 — manual sign-off (Jaehwan)

Each item verifies a real install path end-to-end, the way a user would hit it:

- [x] **Claude Code**: install the plugin from `clients/claude/runtime/plugin`
  (marketplace-style local install), confirm `/membase:login`, `/membase:remember`,
  `/membase:recall` commands work and the session-start hook injects context.
  — 2026-07-05: marketplace source = this repo dir, plugin v0.1.4,
  `claude plugin validate` green, logged-in status + session-start context
  confirmed, remember→recall round-trip via the bundled stdio server
  (sentinel `G2-CLAUDE-7f3a`).
- [x] **Cursor**: point Cursor at `clients/cursor/mcp.json`, confirm the
  membase MCP tools appear and a remember→search round-trip works; rules and
  skills render. — 2026-07-05: `~/.cursor/mcp.json` matches the golden entry;
  round-trip verified by Jaehwan in Cursor; rules/skills copied from
  `clients/cursor/{rules,skills}` into the working project.
- [x] **Codex CLI**: `~/.codex/config.toml` per `docs/install/codex.md`,
  confirm tools respond. — 2026-07-05: `codex mcp add` + Codex-managed OAuth
  (`codex mcp list` shows Auth: OAuth); in-session search_memory returned the
  cross-client sentinel.
- [x] **Hermes**: install `clients/hermes/python` into a Hermes host
  (`pip install -e`), run `hermes-membase-install`, confirm provider loads and
  memory tools + auto-capture work; headless `client_credentials` path once.
  — 2026-07-05: installed into the hermes-agent venv, browser OAuth login,
  provider import OK, in-session memory search returned the cross-client
  sentinel. Footnotes accepted at sign-off: auto-capture rides the running
  session worker (not separately observed end-to-end); the package's headless
  `client_credentials` path was not run locally (secret lives only in GH
  secrets) — the same grant is exercised daily by Tier 2/3 CI.
- [x] **OpenClaw**: already running live from this repo on the Mac gateway —
  confirm the Telegram bot memory flows once more after the final merge. —
  2026-07-05, after PR #12: search + wiki search + add_wiki via
  @jaehwanlee_mac_bot; `hooks.allowConversationAccess: true` required for the
  agent_end capture hook (documented in docs/install/openclaw.md caveat if
  missing).
- [x] Skim `docs/install/*.md` — every instruction matches what you just did.
  — 2026-07-05: one stale passage found and fixed in the same change
  (cursor.md claimed rules/skills were deferred; they were ported in Group C).

## When both gates are checked

Only then, in order (each its own reviewed change):

1. Version/tag decision + first release tag (D1 leaves naming open).
2. Publishing: npm (claude/openclaw runtimes if desired), PyPI (hermes),
   marketplace submissions per `docs/marketplace-assets.md`.
3. Old-repo deprecation notices + archive per `docs/deprecation-plan.md`
   (READMEs point here; repos archived, not deleted).
4. Retire the standalone working copies under `~/Desktop/membase/` once launch
   gates pass.

## North-star scope v2 — feature pillars (added 2026-07-07)

The north star is wider than repo consolidation: the deprecation gate above is
one axis, and these three product pillars are the other. The old repos are not
truly replaced until every client has them.

**Engineering principle (applies to all three):** use officially documented
platform features (hooks, rules, custom prompts, provider slots). Do not
invent workarounds; a workaround is acceptable only when a well-known project
(e.g. claude-mem) already ships the same pattern.

### Pillar 1 — Hook-based capture

Just having a conversation uploads memory to Membase, passively, via each
platform's official hook mechanism.

| Client | Status | Mechanism |
| --- | --- | --- |
| Claude Code | Done | `hooks.json` — tool/compact summaries → disk spool → flush (plugin login supplies hook auth) |
| OpenClaw | Done | `api.on("agent_end")` capture inside the long-lived gateway process |
| Hermes | Done | provider `on_session_end` slot |
| Cursor | Decided (2026-07-07), to build | Two connection modes, below |
| Codex | Decided (2026-07-07), to build | Two connection modes, below |

Decision for Cursor/Codex — **two connection modes**, both official-features-only.
**Auto-capture is the default: the stdio bundle is the recommended install**,
so out of the box every client behaves like Claude Code (decided 2026-07-07).

- **stdio bundle mode (default install).** Ship the bundled stdio MCP server
  (the same approach Claude Code uses) via Cursor `mcp.json` / Codex
  `config.toml` command entries — both officially supported. Its login stores
  tokens on disk, so hooks flush the capture spool directly and inject
  recall context in real time: full Claude Code parity, auto-capture on by
  default. This answers the "local stdio fallback" question D3 left open
  (the ledger row updates with the implementation PR). Requires an
  install-path update in the Membase official docs (membase repo) when it
  ships.
- **HTTP mode (fallback — dashboard one-click / no-Node environments).**
  Hook processes cannot authenticate (OAuth tokens live inside the app), so
  hooks only *collect*: official events (Cursor `afterFileEdit`/`stop` via
  `~/.cursor/hooks.json`; Codex `PostToolUse`/`Stop` via plugin-manifest
  hooks writing under the official `PLUGIN_DATA` dir) append redacted
  summaries to a local spool. Upload rides the already-authenticated in-app
  AI: the session-start hook injects "N pending captures — flush them" and
  the AI calls `add_memory`; handoff and dreaming also flush first.
  Auto-capture still works, with cloud sync lagging by at most one session.
- Both modes share one spool contract in `capture-core`: jsonl line format,
  secret redaction **before** the line is written, truncate after successful
  upload — so "missing from cloud" is defined as "still in the spool".
- **claude-mem-style resident worker: rejected.** The stdio bundle reaches
  real-time capture without a daemon's process-lifecycle burden (PID files,
  spawn locks, supervisor, ports), and a worker would still need its own
  Membase login anyway.

### Pillar 2 — Handoff

Definition: same-client continuation is shared through a **local file**;
cross-client continuation is shared by **asking the client to recall** the
`[HANDOFF]`-tagged memory.

| Client | Status | Notes |
| --- | --- | --- |
| Cursor | Matches definition | skill writes `.cursor/rules/membase-handoff.mdc`; Rules auto-load injects it (PR #24) |
| Codex | Matches definition | `/handoff` prompt writes `.codex/membase-handoff.md`; SessionStart hook injects it (PR #24) |
| Claude Code | Deviates | same-client continuation uses cloud search prefetch at SessionStart, not a local file. Normalizing to a local file would drop the search-quota dependency and the relevance-top-1 weakness — open decision |
| OpenClaw | Deviates | `membase_handoff` tool is cloud-only in both directions; the gateway is a long-lived local process, so a local file is possible — open decision |
| Hermes | Deviates | `membase_handoff` tool is cloud-only in both directions (same semantics as OpenClaw); no session-start injection — recall is explicit via the tool |

Storage policy (decided 2026-07-06, superseding append-only): the cloud
keeps exactly **ONE handoff per project** via replace-on-store — storing a
new handoff deletes the previous `[HANDOFF]` episodes in the same project
scope (only tagged episodes, capped batch, failures non-fatal). Clients that
cannot delete on the remote MCP server (HTTP-mode Cursor/Codex) append
temporarily; the next store from a delete-capable client FOR THE SAME
PROJECT sweeps the leftovers, so each project's state converges to one. Injection stays exactly the
**latest one** by time — the safety net for the convergence window. Handoff
store also flushes the capture spool first (Pillar 1 HTTP mode), so switching
clients never leaves fresh captures behind.

### Pillar 3 — Dreaming

Definition: upload local work that is **missing from the cloud** — sweep local
artifacts (handoff files, spool leftovers, session notes) and `add_memory`
what Membase lacks. Not implemented on any client.

Design direction: an AI-invoked skill/command, because the AI's MCP tools are
already authenticated — no hook auth needed. Concretely, dreaming is the
named flush-and-sweep of the Pillar 1 spool (plus other local artifacts). In
the default stdio bundle mode hooks flush continuously and dreaming is the
catch-up/sweep for anything left behind; in HTTP fallback mode it IS the
upload half of capture.
