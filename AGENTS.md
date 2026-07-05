# Agent Context — membase-plugin-mcp

Handoff snapshot: 2026-07-05, main @ `dd79c0c`. This file is the working
context for any coding agent (Cursor, Claude Code, Codex) picking up this repo.

## What this repo is

The single public integrated connector repo for Membase. It absorbed four
standalone connector repos (`claude-membase`, `cursor-membase`,
`hermes-membase`, `openclaw-membase`) and added a fifth client (Codex CLI).
North star: launch this repo, then deprecate + archive the four old repos.

Layering (dependencies point down only):

```
clients/{claude,cursor,codex,hermes,openclaw}   per-client adapters (+ runtimes)
packages/connector-sdk                          ClientAdapter interface
packages/capture-core                           shared runtime primitives (ADR 0002, in progress)
packages/core                                   identity, endpoints, MCP config gen, redaction
→ Membase Context API (server, private)
```

Public surface is ONLY: `remember` / `search` / `getContext` /
`deleteOrForget` + manifest/config generation + smoke tests. Never expose or
reference Membase internals (storage schema, graph, embeddings, ranking) —
`pnpm check`'s public-surface guard fails the build if you do.

## Non-negotiable rules

1. **`git fetch` + rebase on `origin/main` before starting any work.** This
   repo has multiple local working copies (Desktop, `~/codes`, iCloud) driven
   by different sessions; local `main` goes stale fast. The scheduled Codex
   automation loop was retired in PR #11 (2026-07-05) — all work now flows
   through interactive sessions via branch → `pnpm check` → PR.
2. **`pnpm check` must pass before any PR.** It chains ~21 guards: generated
   artifacts byte-parity, secret hygiene, native-artifacts ledgers,
   version parity, runtime decision ledger, packaging-action parity,
   review readiness, per-runtime typechecks, and real runtime test suites.
3. **Every decision gets a doc + a guard.** If you change a decision, update
   the doc (usually `docs/` or an ADR) AND the script that enforces it, in the
   same PR.
4. **No publishing.** npm/PyPI/marketplace publishing stays disabled until
   Jaehwan's explicit sign-off (enforced by `packaging-action-parity`).
5. **No secrets in files, ever.** Auth is OAuth (browser) or, headless,
   `client_credentials`; configs reference env vars, never values.
6. Committed manifests/configs under `manifests/` and `clients/*/` are golden:
   regen with `pnpm generate` and let `check-generated-artifacts` prove parity.

## Auth / transport model (finalized)

- No user-supplied API key anywhere. Server hosts: `api.membase.so`,
  MCP `https://mcp.membase.so/mcp`.
- Claude Code: plugin-bundled **stdio** MCP server (in
  `clients/claude/runtime`). Cursor / Hermes / OpenClaw / Codex MCP configs:
  **remote HTTP** + OAuth. Hermes and OpenClaw additionally ship native
  runtimes (Python package / TS plugin) as their primary paths.
- CI e2e auth uses a `client_credentials` service token against staging
  (see `docs/` e2e docs; Tier 1 = no creds, Tier 2 = fast smoke every PR,
  Tier 3 = nightly deep quality gates).

## Current state and what's next

Done (merged to main):

- Groups A–C: all old-repo runtimes/artifacts copied in; parity guards +
  their test suites run in CI (`pnpm openclaw:runtime-test`,
  `claude:runtime-test`, Hermes Python unittest, `capture-core:test`).
- `/membase-connect` skill (PR #5) for local install/verify of all 5 clients.
- ADR 0002 (shared capture-core) + ADR 0003 (agents as descriptors) accepted.
- **Group D1 slices 1–3** (PRs #7–#9): `packages/capture-core` now owns
  sanitize + golden vectors (`spec/sanitize-vectors.json`), the
  `MembaseTransport` OAuth client (single-flight refresh, retry-on-401,
  injected error classes), and the disk capture spool (promoted from Claude's
  runtime; parameterized by state dir + sanitize fn). Claude and OpenClaw
  runtimes import it; bundled `.cjs` artifacts regenerated.

In flight / next (in rough order):

1. **D1 remainder**: capture kinds extraction (last item in ADR 0002 D1 scope).
2. **D2**: wire Hermes Python tests to the golden vectors; shrink
   `membase_hermes` to the shim surface. Known divergence to reconcile here:
   OpenClaw's capture path does not redact secrets — converge on Claude's
   policy deliberately.
3. **D3**: Cursor `hooks.json` + Codex plugin-hook adapters on capture-core
   (the disk spool exists for exactly this — Cursor hooks are spawned stdio
   processes like Claude's).
4. **Group E (ADR 0003)**: `defineMcpHostAgent(descriptor)` in connector-sdk;
   migrate cursor/codex byte-identically, then add the 7 remaining documented
   agents (ChatGPT, Claude custom connector, Gemini CLI, OpenCode, Poke,
   VS Code, Generic MCP URL).
5. **Launch (blocks publishing/deprecation, not D/E merges)**: the two-key
   gate in `docs/north-star-readiness.md` — Gate 1 automated (pnpm check + CI
   + Tier 3 green + OpenClaw live), Gate 2 manual (Jaehwan installs all 5
   clients end-to-end). Only after both: release tag → publish → deprecate →
   archive old repos.

Deliberate non-goals (do not "fix"): OpenClaw's in-memory buffer and Hermes's
thread queue stay runtime-local (the three queues are NOT accidental
duplication — see ADR 0002 slice-3 note); no adapter-to-adapter merging; no
Hermes rewrite in TS; no `clients/agents/*` directory rename.

## Key files

- `docs/adr/0001..0003` — architecture decisions (read these first).
- `docs/north-star-readiness.md` — launch gate checklist.
- `docs/implementation-overview.html` — non-developer overview (Korean).
- `PLAN.md` + `RUN_LOG.md` — the automation loop's plan and append-only log;
  append to RUN_LOG.md when completing a meaningful unit of work.
- `docs/runtime-parity-decisions.md` — D1–D6 launch decision ledger
  (guard-enforced; update doc + checker together).

## Commands

```bash
pnpm install            # workspace setup (pnpm monorepo)
pnpm check              # the full guard chain — must be green
pnpm generate           # regenerate committed manifests/configs
pnpm smoke:execute      # local smoke against stub server (4 clients)
pnpm capture-core:test  # bun tests + golden vectors
pnpm claude:runtime-test / pnpm openclaw:runtime-test
```
