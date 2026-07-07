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
truly replaced until every client has them — where "has them" means the form
appropriate to that client's architecture. A long-lived in-process host
(OpenClaw/Hermes) keeps unsent captures in RAM, not a disk spool, so the
disk-spool-shaped forms of Pillars 2–3 don't apply *as built* — but that RAM-only
path is a crash-loss window, so it's a tracked enhancement, not a settled n/a.

**Status (2026-07-07, verified against code):** Pillar 1 (hook capture) is Done
on all five (Cursor/Codex shipped via PRs C/D). Pillar 2 (handoff) is Done —
file-based on the three spawned-process clients (Claude/Cursor/Codex),
cloud-only-by-choice on OpenClaw/Hermes (continuation still works via cloud
recall). Pillar 3 (dreaming) is Done on the three disk-spool clients; on
OpenClaw/Hermes their capture never reaches disk, so a crash/restart is a
**data-loss window** — closing it (failure-path disk spool + a `dream` flush)
is planned in **ADR 0005** (OpenClaw DR-1, Hermes DR-2). See each pillar's table.

**Engineering principle (applies to all three):** use officially documented
platform features (hooks, rules, custom prompts, provider slots). Do not
invent workarounds; a workaround is acceptable only when a well-known project
(e.g. claude-mem) already ships the same pattern.

### Pillar 1 — Hook-based capture

Just having a conversation uploads memory to Membase, passively, via each
platform's official hook mechanism.

| Client | Status | Mechanism |
| --- | --- | --- |
| Claude Code | Done | `hooks.json` — per-session tool observations → scratch → ONE session digest → disk spool → flush (plugin login supplies hook auth) |
| OpenClaw | Done | `api.on("agent_end")` capture inside the long-lived gateway process |
| Hermes | Done | provider `on_session_end` slot |
| Cursor | Done | `~/.cursor/hooks.json` → `cursor-hook.mjs` translates payloads and delegates to the shared hook bundle; two connection modes, below (PR D `40e341e`, schema fix #34) |
| Codex | Done | plugin-manifest `hooks.json` → shared `hook.cjs` (`SessionStart`/`UserPromptSubmit`/`PostToolUse`/`Stop`); two connection modes, below (PR C `2df1e9b`, hardening #36) |

Design for Cursor/Codex — **two connection modes**, both official-features-only
(decided 2026-07-07, **shipped**: PRs C/D above).
**Auto-capture is the default: the stdio bundle is the recommended install**,
so out of the box every client behaves like Claude Code.

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
  observations to the per-session scratch, folded into one session digest on
  the spool at session end (see "Session-digest capture" below). Upload rides
  the already-authenticated in-app
  AI: the session-start hook injects "N pending captures — flush them" and
  the AI calls `add_memory`; handoff and dreaming also flush first.
  Auto-capture still works, with cloud sync lagging by at most one session.
- Both modes share one spool contract in `capture-core`: jsonl line format,
  secret redaction **before** the line is written, truncate after successful
  upload — so "missing from cloud" is defined as "still in the spool".

**Session-digest capture ("dreaming v2", decided 2026-07-07).** Tool
observations are NOT uploaded per tool call or per batch — that produced dozens
of contentless "used N tool(s)" memories per session. Instead each meaningful
tool call (file edits, important commands, sub-agent tasks — never prompts or
assistant messages) is appended to a per-session **scratch** file
(`<dataDir>/scratch/<session_id>.jsonl`), and the whole session is folded into
**exactly one** `session_summary` record in the spool when the session ends.
Lifecycle: `SessionEnd` reads the scratch, enqueues the digest, and deletes the
scratch only after a durable enqueue (a failed enqueue keeps it for retry). For
a client with no end event (Codex) or a crash, the next `SessionStart` sweeps
any scratch idle >30 min into a digest; a scratch idle >7 days is discarded
undigested. The digest's client attribution, cwd, project, and local-timezone
date come from the SESSION's own persisted scratch, not the process that runs
the sweep. An explicit `captureMode: off` consumes (deletes) the scratch without
uploading. Enforced by contract C-HOOK-2/2b/2c and C-SPOOL-1/2.
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
| Claude Code | Matches definition | `store_handoff` writes a per-project local file under the plugin data dir; SessionStart injects file-first with cloud search as the cross-client fallback |
| OpenClaw | Cloud-only (accepted) | `membase_handoff` tool stores/recalls via the cloud in both directions; no local file. The long-lived gateway *could* keep a local file — left as an open enhancement, not a gap, since cloud recall already covers continuation |
| Hermes | Cloud-only (accepted) | `membase_handoff` tool, same cloud-only semantics as OpenClaw; recall is explicit via the tool (no session-start injection). In-process host, so the local-file form is n/a by the same architecture split as Pillar 3 |

Injection framing (2026-07-06): every injection carries its age
(`stored_at`/`age_days`); handoffs older than 7 days are announced in one
line instead of injected — a stale baton is noise, but stays reachable on
request.

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
what Membase lacks.

An AI-invoked skill/command, because the AI's MCP tools are already
authenticated — no hook auth needed. Concretely, dreaming is the named
flush-and-sweep of the Pillar 1 disk spool (plus other local artifacts). In the
default stdio bundle mode hooks flush continuously and dreaming is the
catch-up/sweep for anything left behind; in HTTP fallback mode it IS the upload
half of capture.

| Client | Status | Notes |
| --- | --- | --- |
| Claude Code | Done | `/membase:dream` command — flush `pending.jsonl`, then optional consolidation sweep (PR E `cf62efe`, protocol fix #35) |
| Cursor | Done | `skills/dream/SKILL.md` — same flush-then-sweep over the shared spool |
| Codex | Done | `runtime/prompts/dream.md` — same |
| OpenClaw | Planned (ADR 0005, DR-1) | Today: capture buffers in-memory (`messageBuffers` Map), flush failures **retained in RAM** — a gateway restart loses them, and there is no disk spool for a dream flush to target. Plan: route failed uploads to the shared capture-core disk spool + a `dream` CLI flush (TS reuse, no new dep). |
| Hermes | Planned (ADR 0005, DR-2) | Today: capture uses a bounded in-process `queue.Queue` that **drops on failure/overflow**; nothing persists. Plan: a Python disk spool (golden-vector-bound to the TS spool) + `hermes-membase dream` subcommand. Heavier than OpenClaw (Python port), so a separate step. |

The split is architectural: the three spawned-process clients
(Claude/Cursor/Codex) persist failed captures to a **disk spool**, so a crash
loses nothing and dreaming later uploads the backlog. The two long-lived
in-process hosts keep unsent captures in **RAM only**, so there is nothing on
disk for a dream sweep to act on — but a crash/restart drops them. Dreaming (the
sweep) is therefore complete for every client that has a disk spool; giving
OpenClaw/Hermes the same disk-persist layer (closing the loss window, then
adding a sweep) is the natural next step, tracked as a post-launch enhancement,
not a shipped-and-forgotten "n/a".
