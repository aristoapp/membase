# ADR 0002 — Shared capture-core, per-host hook adapters, two-language policy

Status: accepted (Jaehwan, 2026-07-05) · Builds on ADR 0001 and the Group B/C
copy-ins. Implementation is **Group D**; it starts only after the
`docs/north-star-readiness.md` two-key gate clears (do not block launch on it).

## Context

After Groups B/C the repo carries three copies of the same client-side runtime
logic, written independently in the standalone era:

| Logic | Claude (TS) | OpenClaw (TS) | Hermes (Python) |
| --- | --- | --- | --- |
| secret filtering | `runtime/src/sanitize/` | `runtime/src/utils.ts` | `sanitize.py` |
| capture queue / retry | `runtime/src/spool/` | `hooks/capture.ts` buffers | `capture.py` CaptureWorker |
| HTTP client + OAuth refresh | `runtime/src/api/client.ts` | `runtime/src/client.ts` | `client.py` |
| recall assembly | `hooks/session-start.ts` | `hooks/recall.ts` | `provider.py` |

The PR #3 review demonstrated the cost: the same class of bug (lost capture
batches, shutdown races, expiry recovery) existed in one copy but not the
others — three places to fix the same idea, each differently wrong.

Meanwhile both remaining MCP-host clients grew real hook systems (verified
2026-07-05): Cursor ships `hooks.json` with `sessionStart`/`postToolUse`/
`preCompact`/`stop`/… as spawned stdio-JSON processes, and Codex CLI ships a
trust-gated plugin hook system plus `notify` events. Auto-capture/auto-recall
for Cursor and Codex is therefore buildable — but only sane on top of a single
shared core.

## Decision

### 1. One capture-core, N host adapters

Split by "what" vs "when":

```
[shared — packages/capture-core]        [separate — per-host adapter]
 sanitize / capture kinds / spool        WHEN it runs: hooks.json events
 buffering + retry / recall assembly     (Claude, Cursor), api.on("agent_end")
 MembaseClient + OAuth refresh           (OpenClaw), provider callbacks
                                         (Hermes), plugin hooks (Codex) —
                                         event-name/payload translation ONLY
```

Adapters stay per-client (ADR 0001 thin-shim rule); they contain no business
logic, only registration and payload mapping. Never merge adapters sideways;
push shared behavior down into the core.

### 2. Language policy: full unification is impossible; minimize the second language

Hosts dictate in-process languages: the OpenClaw gateway loads TS modules
in-process, the Hermes host loads Python modules in-process. Rejected
alternatives:

- **TS-only via subprocess shim for Hermes** — makes a Python tool require a
  Node runtime on user machines. Rejected.
- **Hermes as MCP-only client** — Hermes does have an MCP client, but the
  provider slot, built-in-memory mirroring, and auto-capture are host-native
  Python APIs; MCP-only is a feature downgrade. Rejected.
- **Python-only** — impossible for OpenClaw (in-process TS); wrong distribution
  story for Claude/Cursor plugin bundles. Rejected.

Accepted shape: **TS core (1) + minimal Python shim (1) + language-neutral
spec**. The Python surface shrinks to: provider registration, event → core-call
mapping, client-side sanitize, and the local spool.

### 3. Server-side lifting is the strongest unification

Anything that does not have to run on the user's machine moves into the
Membase server (a single codebase, no per-language copies):

- recall/context assembly (search + profile + formatting) → a server
  `get_context`-style endpoint the clients call with one request;
- capture normalization / dedupe / capture-kind policy → server ingest.

Hard client-side residue (never lift): **sanitize** (secrets must be filtered
before they leave the machine) and the **offline spool** (server can't buffer
for an offline client).

### 4. Golden vectors bind the two languages

`packages/capture-core/spec/*.json` holds language-neutral test vectors
(sanitize inputs → redacted outputs, capture-kind decisions, spool
retry/overflow semantics). The TS core's tests and the Python shim's unittest
suite consume the SAME files, so behavioral drift fails CI instead of
surfacing as a per-client bug months later. Seed the sanitize vectors from
`clients/claude/runtime/tests/sanitize.test.ts` fixtures.

## Implementation phases (Group D)

- **D1** — extract `packages/capture-core` (TS) from the Claude + OpenClaw
  runtimes: client/OAuth, sanitize, spool/buffer, capture kinds. Both runtimes
  import it; their bun tests keep passing unchanged. No behavior change.
- **D2** — golden vector spec + wire Hermes's Python tests to the vectors;
  shrink `membase_hermes` to the shim surface (server-side lifting lands here
  as membase API work, tracked separately in the membase repo).
- **D3** — new host adapters on the core: Cursor `hooks.json` (spawned stdio
  process, same execution model as Claude's `hook.cjs`) and Codex plugin
  hooks (verify the trust-approval UX first). Auto-capture/auto-recall reach
  all five clients.

## Non-goals

- No adapter merging (see ADR 0001 / D4 ledger).
- No publishing changes; Group D does not gate the north-star launch.
- No Hermes rewrite in TS.

## Risks

- Cursor third-party hook distribution is partner-centric today; D3's Cursor
  leg may need a "copy hooks.json into your project" install path first.
- Codex hook trust prompts could hurt onboarding; measure before shipping.
- Extracting the core must not change bundled-artifact provenance for Claude's
  shipped `.cjs` bundles without re-verifying `claude plugin validate` and the
  bun test suites.
