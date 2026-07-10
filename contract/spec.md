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
- `@membase/capture-core` package exports (import from the built package):
  `createCaptureSpool`, `createTokenStore`, `redactSecrets`, `looksSensitive`,
  `MembaseTransport`.
- Files under the data dir: `spool/pending.jsonl`, `credentials.json`,
  `config.json` — their shapes are contract surface (C-SPOOL-1, C-TOK-1). The
  per-session scratch (`scratch/<session_id>.jsonl`, JSON-Lines: an optional
  meta header line then one observation object per meaningful tool call) is
  contract surface for C-HOOK-2/C-CUR-2/C-CUR-3/C-SPOOL-2 — a staging file, not
  a memory; nothing here is ever uploaded on its own.

## Wire schemas the stub API must speak (source: public API client behavior,
pinned here so tests and server cannot drift silently)

- `GET /memory/search` response envelope: `{"episodes": [<bundle>...]}`;
  each bundle is `{"episode": {"uuid", "name", "summary", "valid_at", ...}}`.
  Handoff identification reads `episode.name`/`episode.summary`.
- `POST /oauth/token` (refresh): form-encoded `grant_type=refresh_token`;
  response `{"access_token", "refresh_token"?, "expires_in"?, "scope"?}`.
- Ingest: authenticated POST whose JSON body carries `content` and `source`.
- `createTokenStore` factory option shape: `{ dir: () => string,
  filename?: string }`. `createCaptureSpool`: `{ stateDir: () => string,
  sanitize: (t: string) => string, minContentLength?: number }`.
- `flushSpool(send)` failure signalling: the uploader signals failure by
  THROWING or by resolving `false`; any other resolution counts as uploaded.

## Spool (source: the shared spool contract — "Both modes share one spool
contract"; capture-core exported types `SpoolRecord`, `CaptureSpool`)

- C-SPOOL-1 — `spool/pending.jsonl` is JSON-Lines; each line parses to an
  object with at least `capture_id` (string), `capture_kind` (string),
  `content` (string), `created_at` (ISO timestamp). Source: `SpoolRecord`
  type export.
- C-SPOOL-2 — Secret redaction happens BEFORE the line is written: enqueue
  content containing a secret assignment (e.g. `API_KEY=dummyvalue123`) via
  any capture entry point → the secret value never appears anywhere in the
  spool file. Source: spool contract — "secret redaction before the line is
  written".
- C-SPOOL-3 — Truncate-after-upload: after a successful flush, uploaded
  records are gone from `pending.jsonl` AND re-enqueueing the same content
  does not create a new record ("missing from cloud" ≡ "still in the
  spool"). Source: spool contract sentence.
- C-SPOOL-4 — Failed upload loses nothing: if the API answers 403 for every
  ingest, the records remain in the spool afterward (observable via
  `pendingSpoolCount()` or the file). Source: quota-handling design (retry
  or keep records spooled on quota errors) + PR A contract.
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
- C-HOOK-2 — Session-digest capture: `hook.cjs PostToolUse` run as a per-tool
  client (`MEMBASE_CLIENT_SOURCE=codex`) with a Codex-shaped payload
  (`{session_id, tool_name:"apply_patch", tool_input:{command:"*** Update
  File: x.ts"}}`) records the observation to the per-session SCRATCH
  (`<dataDir>/scratch/<session_id>.jsonl`) naming the touched file — and adds
  NOTHING to the upload spool (a single tool call is not a memory), with no
  network. C-HOOK-2b: `SessionEnd` folds the whole session's scratch into
  exactly ONE `session_summary` record in the spool, attributed to the client
  source, then deletes the scratch. C-HOOK-2c: for a client with no end event
  (Codex) or a crash, the next `SessionStart` sweeps any scratch idle >30min
  into a digest. C-HOOK-2a: tool-capture events are client-owned —
  the shared hooks.json registers both PostToolUse and PostToolBatch for
  every host, so the runtime runs only the event the detected client owns
  (Claude batches; Codex/Cursor fire per tool) and the other is a no-op.
  Source: the session-digest capture design decision + the root-payload
  single-hooks.json layout.
- C-HOOK-3 — Attribution follows `MEMBASE_CLIENT_SOURCE`: with `codex`, the
  session digest's text/display identifies Codex, not Claude Code; with the
  env unset, upload requests identify claude-code. Source: PR #27
  description-level promise ("MEMBASE_CLIENT_SOURCE ... source attribution").
- C-HOOK-4 — Capture opt-out is user-controlled: with
  `CLAUDE_PLUGIN_OPTION_captureMode=summary` in env BUT
  `{"captureMode":"off"}` in `<dataDir>/config.json`, PostToolUse adds
  NOTHING to the scratch or the spool. Env acts only as a default when disk
  has no value. Source: the "auto-capture default" decision + #25
  ("default on when no config exists" — an explicit user off must win).
- C-HOOK-5 — With credentials pointing at a stub API: `Stop` flushes pending
  records as authenticated POSTs whose JSON body carries
  `source` = the client source; `SessionStart` flushes at most 1. On 401 the
  runtime refreshes via `POST /oauth/token` exactly once and retries.
  Source: capture-core transport JSDoc ("single-flight-refresh +
  retry-on-401") plus source attribution.
- C-HOOK-7 — Single-document stdout: whatever a hook entry point prints is
  at most ONE JSON object, parseable with a single JSON.parse of the whole
  stdout. Source: Claude Code hooks output schema (one JSON object per hook
  invocation); two concatenated objects are unparseable.
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
  `{conversation_id, workspace_roots:[dir], file_path}` records the edited
  file to the session scratch (`scratch/<conversation_id>.jsonl`), not the
  upload spool; stdout is empty.
- C-CUR-3 — `cursor-hook.mjs afterShellExecution` with `{command: "pnpm build"}`
  scratches a Bash observation; trivial/read-only commands (e.g. `ls`) scratch
  nothing. Source: install docs promise that capture is "summaries", not a
  keylog — noise filtering is part of the summary contract.
- C-CUR-4 — Events outside the documented set (anything unknown) are silent
  no-ops with exit 0.

## Codex handoff recall (source: docs/install/codex.md Session Handoff;
served by the shared hook bundle with MEMBASE_CLIENT_SOURCE=codex)

- C-CDX-1 — `hook.cjs SessionStart` with `MEMBASE_CLIENT_SOURCE=codex`,
  `MEMBASE_HANDOFF_FILE` pointing at a non-empty FRESH file (mtime now),
  and no credentials: the single-JSON stdout's additionalContext contains
  the file text inside a `<membase-handoff stored_at=...>` block.
- C-CDX-2 — Missing/empty handoff file → no handoff block in the output
  (the not-logged-in line may still appear); exit 0.
- C-CDX-3 — STALE file (mtime older than 7 days): the output announces a
  stale handoff exists but does NOT inject the file body. Source: the
  handoff injection policy (age/TTL framing).

## Handoff tag round-trip (source: the `[HANDOFF]` tag convention;
skills/prompts describe the literal tag)

- C-HDF-1 — A handoff stored per the documented convention has content
  beginning with the literal `[HANDOFF]` and, when recalled by name/summary,
  is identifiable by that prefix alone (no other field needed). Testable at
  the text level: the tag builders/filters exposed by any client agree on
  the same literal (cross-client greppable: the string `[HANDOFF]` appears
  identically in claude runtime, openclaw runtime, cursor skill, codex
  prompt, hermes provider).
- C-HDF-2 — SessionStart handoff injection picks the LATEST handoff by
  time, not the most relevant: with credentials and a stub API returning
  (per the wire schema above) an OLDER `[HANDOFF]` bundle first (higher
  relevance rank) and a NEWER one second, the single-JSON SessionStart
  output contains the newer handoff and not the older one. Non-handoff
  bundles in the window are ignored. Source: the handoff injection rule
  "always exactly the latest one".

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
