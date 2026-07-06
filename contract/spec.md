# Behavior Contracts — auto-capture / handoff / dreaming

Purpose: implementation-independent test targets. Every contract cites its
SOURCE OF TRUTH — a doc promise, a public type signature, or a platform
schema — never implementation code. Tests written from this file must not
read `src/` or existing test files; they exercise only the public entry
points listed per contract. A failing test means either a bug in the code or
an error in this spec — both are findings.

Conventions for all contracts: run entry points with an isolated
`MEMBASE_DATA_DIR` (temp dir). Feed stdin with `printf`/pipes (never shell
`echo` — escape interpretation differs). "Stub API" means a local
`node:http` server the test controls; point the runtime at it by writing
`{"apiUrl": "http://127.0.0.1:<port>"}` to `<dataDir>/config.json` and a
credentials file per C-TOK-1's shape to `<dataDir>/credentials.json`.

## Entry points (the ONLY things tests may touch)

- `clients/claude/runtime/plugin/scripts/hook.cjs <Event>` — stdin: one JSON
  object; stdout: nothing or one JSON object (schema per C-HOOK-*). Env:
  `MEMBASE_DATA_DIR`, `MEMBASE_CLIENT_SOURCE`,
  `CLAUDE_PLUGIN_OPTION_captureMode`.
- `clients/cursor/runtime/cursor-hook.mjs <event>` — same stdin/stdout
  discipline; env additionally `MEMBASE_HOOK_BUNDLE` (path override for the
  delegated bundle).
- `clients/codex/runtime/session-start.mjs` — stdin: one JSON object; env
  `MEMBASE_HANDOFF_FILE`.
- `@membase/capture-core` package exports (import from the built package):
  `createCaptureSpool`, `createTokenStore`, `redactSecrets`, `looksSensitive`,
  `MembaseTransport`.
- Files under the data dir: `spool/pending.jsonl`, `credentials.json`,
  `config.json` — their shapes are contract surface (C-SPOOL-1, C-TOK-1).

## Spool (source: docs/north-star-readiness.md "Both modes share one spool
contract"; capture-core exported types `SpoolRecord`, `CaptureSpool`)

- C-SPOOL-1 — `spool/pending.jsonl` is JSON-Lines; each line parses to an
  object with at least `capture_id` (string), `capture_kind` (string),
  `content` (string), `created_at` (ISO timestamp). Source: `SpoolRecord`
  type export.
- C-SPOOL-2 — Secret redaction happens BEFORE the line is written: enqueue
  content containing a secret assignment (e.g. `API_KEY=dummyvalue123`) via
  any capture entry point → the secret value never appears anywhere in the
  spool file. Source: north-star "secret redaction before the line is
  written".
- C-SPOOL-3 — Truncate-after-upload: after a successful flush, uploaded
  records are gone from `pending.jsonl` AND re-enqueueing the same content
  does not create a new record ("missing from cloud" ≡ "still in the
  spool"). Source: north-star spool contract sentence.
- C-SPOOL-4 — Failed upload loses nothing: if the API answers 403 for every
  ingest, the records remain in the spool afterward (observable via
  `pendingSpoolCount()` or the file). Source: docs/implementation-overview
  §7.5 quota section ("저장을 재시도하거나 스풀에 쌓아두는") + PR A contract.
- C-SPOOL-5 — Concurrency: two processes enqueueing simultaneously never
  corrupt the file (every resulting line still parses; no record lost).
  Source: `CaptureSpool` JSDoc ("queue lives on disk with a lock file").

## Token store (source: `StoredTokens`/`TokenStore` type exports + JSDoc
"File is 0600 inside a 0700 dir")

- C-TOK-1 — `credentials.json` shape: `{clientId, accessToken, refreshToken}`
  strings required; `expiresAt` number, `scope`, `clientSecret` optional.
  Round-trips through `createTokenStore().write/read`.
- C-TOK-2 — File mode 0600; parent dir 0700.
- C-TOK-3 — Corrupt file (not JSON, JSON `null`, missing required field) →
  `read()` returns null, never throws.

## Shared hook bundle (source: Claude Code hooks output schema
`hookSpecificOutput.additionalContext` per docs.anthropic hooks; behavior
promises in docs/install/{cursor,codex}.md Auto-Capture sections)

- C-HOOK-1 — `hook.cjs SessionStart` with NO credentials and a non-empty
  spool prints a JSON object whose
  `hookSpecificOutput.additionalContext` mentions the number of pending
  captures and instructions to store them via add_memory. Source:
  install docs "the session-start hook injects 'N pending captures — flush
  them'".
- C-HOOK-2 — `hook.cjs PostToolUse` with a Codex-shaped payload
  (`{tool_name:"apply_patch", tool_input:{command:"*** Update File: x.ts"}}`)
  appends a summary record to the spool that names the touched file — and
  does NOT upload anything (no network with no credentials). Source: install
  codex.md "PostToolUse (including apply_patch file edits)".
- C-HOOK-3 — Attribution follows `MEMBASE_CLIENT_SOURCE`: with `codex`, the
  spooled summary's text/display identifies Codex, not Claude Code; with the
  env unset, requests/records identify claude-code. Source: PR #27
  description-level promise recorded in docs/runtime-parity-decisions.md D3
  addendum ("MEMBASE_CLIENT_SOURCE ... source attribution").
- C-HOOK-4 — Capture opt-out is user-controlled: with
  `CLAUDE_PLUGIN_OPTION_captureMode=summary` in env BUT
  `{"captureMode":"off"}` in `<dataDir>/config.json`, PostToolUse adds
  NOTHING to the spool. Env acts only as a default when disk has no value.
  Source: north-star "auto-capture default" decision + #25 ("default on when
  no config exists" — an explicit user off must win).
- C-HOOK-5 — With credentials pointing at a stub API: `Stop` flushes pending
  records as authenticated POSTs whose JSON body carries
  `source` = the client source; `SessionStart` flushes at most 1. On 401 the
  runtime refreshes via `POST /oauth/token` exactly once and retries.
  Source: capture-core transport JSDoc ("single-flight-refresh +
  retry-on-401"); D3 addendum for source attribution.
- C-HOOK-6 — Hooks never block or crash the host: any entry point with
  garbage stdin (invalid JSON, binary, or stdin held open) exits 0 within
  5 seconds. Source: install docs' fail-open framing; hooks are spawned per
  event and must not hang the session.

## Cursor adapter (source: docs/install/cursor.md Auto-Capture section;
Cursor hooks output schema `{"additional_context": ...}` per cursor.com/docs)

- C-CUR-1 — `cursor-hook.mjs sessionStart` stdout is either empty or exactly
  one JSON object of shape `{"additional_context": "<string>"}` — NEVER the
  Claude `hookSpecificOutput` shape.
- C-CUR-2 — `cursor-hook.mjs afterFileEdit` with
  `{conversation_id, workspace_roots:[dir], file_path}` appends a spool
  record referencing the file; stdout is empty.
- C-CUR-3 — `cursor-hook.mjs afterShellExecution` with `{command: "pnpm build"}`
  spools a Bash-style summary; trivial/read-only commands (e.g. `ls`) spool
  nothing. Source: install docs promise that capture is "summaries", not a
  keylog — noise filtering is part of the summary contract.
- C-CUR-4 — Events outside the documented set (anything unknown) are silent
  no-ops with exit 0.

## Codex handoff recall (source: docs/install/codex.md Session Handoff;
Codex hooks output schema per developers.openai.com/codex/hooks)

- C-CDX-1 — With `MEMBASE_HANDOFF_FILE` pointing at a non-empty file,
  `session-start.mjs` prints `{"hookSpecificOutput": {"hookEventName":
  "SessionStart", "additionalContext": <contains the file text>}}`.
- C-CDX-2 — Missing/empty handoff file → no stdout, exit 0.
- C-CDX-3 — Invoked via a symlinked path, behavior is identical (dotfiles
  setups symlink hook scripts). Source: install docs instruct absolute
  REPO_ROOT paths; symlinked repo roots are ordinary.

## Handoff tag round-trip (source: docs/implementation-overview §7.5 "[HANDOFF]
접두사 관례가 전부"; skills/prompts describe the literal tag)

- C-HDF-1 — A handoff stored per the documented convention has content
  beginning with the literal `[HANDOFF]` and, when recalled by name/summary,
  is identifiable by that prefix alone (no other field needed). Testable at
  the text level: the tag builders/filters exposed by any client agree on
  the same literal (cross-client greppable: the string `[HANDOFF]` appears
  identically in claude runtime, openclaw runtime, cursor skill, codex
  prompt).
- C-HDF-2 — Injection policy: recall picks the LATEST handoff (by time),
  not the most relevant. Source: north-star "always exactly the latest one".

## Dream flush protocol (source: the four dream docs after #35)

- C-DRM-1 — The four dream documents (claude command+skill, cursor skill,
  codex prompt) all specify: rename `pending.jsonl` before uploading, never
  upload records that look like secrets, never delete skipped-secret
  records, delete the renamed file only after all non-secret records are
  stored. Doc-level contract: the same protocol semantics appear in all
  four files (string-level check on the shared sentences).

## Non-goals (do NOT test)

- Live cloud behavior (staging e2e Tier 3 covers it separately).
- Internal module structure, private helpers, exact wording beyond what a
  contract quotes.
