# Architecture

This document describes the repo's shape and records the design decisions
behind it.

## Positioning

This repo is an outbound agent connector kit for
[Membase](https://membase.so). It lets external agents connect to Membase
without exposing Membase's internal memory structure. It is not a product
pivot and should not grow into a generic MCP directory.

## Boundary

Connectors talk to a stable context API. Membase owns storage, ranking,
freshness, provenance, and governance behind that API.

```text
Client plugin or MCP config
  -> client adapter
  -> shared connector core
  -> Membase Context API
  -> private memory engine
```

Public connector APIs may describe capabilities and diagnostics, but they must
not describe the private storage schema, graph model, embedding layout, ranking
pipeline, or internal memory engine.

## Public Tool Surface

Every client reaches the same hosted MCP tool set:

- memory: `add_memory`, `search_memory`, `get_current_date`
- wiki: `add_wiki`, `search_wiki`, `update_wiki`, `delete_wiki`

Clients with native runtimes add client-side surface on top — session
handoffs (`store_handoff` on Claude Code, `membase_handoff` on
OpenClaw/Hermes), profile/forget tools, login/status commands, and the
capture/recall hooks described below. The tool descriptions may describe
capabilities and diagnostics, but never the private storage schema, graph
model, embedding layout, or ranking pipeline.

## Adapter Contract

Each client adapter defines:

- manifest shape
- MCP server config shape
- smoke-test commands

## Repo Boundary

Shared behavior belongs in `packages/core`, `packages/connector-sdk`,
`packages/capture-core`, and `packages/stdio-runtime`.
Client-specific behavior belongs in `clients/{claude,cursor,codex,hermes,openclaw}`.
Generated or canonical examples belong in `manifests/`.

`packages/core` owns the concrete runtime config primitives: connector
identity, endpoint base URL, and MCP server config generation. Auth is OAuth
per client — there is no user-supplied API key anywhere in the kit. Core may
generate client-safe config objects, but it must not import or describe
Membase storage, ranking, graph, embedding, or governance internals.

`packages/connector-sdk` owns the adapter-facing extension surface. Each adapter
receives a `ConnectorRuntimeConfig`, emits a client manifest or MCP config, and
declares smoke-test commands. Config-only MCP hosts can be added as a
`defineMcpHostAgent()` descriptor rather than a hand-written adapter (see
[Design decisions](#descriptors-not-adapters-for-config-only-hosts)).

`packages/capture-core` owns the shared client-side capture runtime: secret
sanitize, injection neutralization, capture kinds, the disk spool,
buffering/retry, handoff tagging/selection, and the OAuth-refreshing HTTP
transport (see [Design decisions](#shared-capture-core-per-host-adapters)).
Recall-context assembly (grouping, budgets, headers) is per-client today; the
neutralization primitive it must call lives in the core.

`packages/stdio-runtime` owns the shared hook handler and stdio MCP server for
hook-driven hosts (Claude Code, Codex, Cursor). One esbuild build produces
`hook.cjs`/`mcp-server.cjs`, and each client plugin package commits its own
copy so it installs self-contained; `pnpm bundle-provenance` asserts every
copy matches a fresh build. Client identity comes from `MEMBASE_CLIENT_SOURCE`
at runtime, and everything that legitimately differs per client (labels,
handoff file conventions, default data dir, injection exclusions) lives in one
descriptor table (`src/clients.ts`) — supporting another stdio host is one
entry there plus a hooks config.

## Client Adapters

- **Claude Code** (`clients/claude`) — implements the SDK `ClientAdapter`,
  emits a compact Claude plugin manifest, and generates a plugin-local (stdio)
  MCP config.
- **Cursor** (`clients/cursor`) — a `defineMcpHostAgent()` descriptor over the
  hosted HTTP MCP endpoint at `https://mcp.membase.so/mcp`, plus optional
  local capture hooks running the package's own committed copy of the shared
  stdio runtime.
- **Codex CLI** (`clients/codex`) — points Codex directly at the streamable-HTTP
  MCP endpoint; auth via Codex-managed OAuth.
- **Hermes Agent** (`clients/hermes`) — ships a native Python provider and
  generates a shared MCP config example for Hermes config translation.
- **OpenClaw** (`clients/openclaw`) — ships a native TypeScript extension
  entrypoint and generates a shared MCP config example.

## Design decisions

The durable decisions that shaped the repo:

### Shared capture core, per-host adapters

Client-side capture logic is split by "what" vs "when". `packages/capture-core`
owns the WHAT: sanitize, capture kinds, spool, buffering/retry, recall
assembly, and the OAuth transport. Each client keeps a thin adapter that owns
only the WHEN — registering for its host's events (Claude/Cursor spawned hook
processes, OpenClaw gateway events, Hermes provider callbacks) and translating
payloads. Adapters carry no business logic; shared behavior is pushed down
into the core, never merged sideways between adapters.

Buffering shape stays per-host: Claude/Cursor/Codex hooks are short-lived
spawned processes and need the disk-persisted, file-locked spool; OpenClaw is
a long-lived gateway and buffers in memory; Hermes uses a bounded worker
queue. These are deliberate shapes fitting three host lifetimes, not
accidental duplication — one abstraction is not forced over them.

### Two languages, one behavior

Hosts dictate languages: OpenClaw loads TypeScript in-process, Hermes loads
Python in-process. The shared core is therefore TypeScript, and Hermes keeps a
minimal Python shim. The two languages are bound by golden vectors:
`packages/capture-core/spec/*.json` holds language-neutral fixtures (sanitize
inputs → redacted outputs, spool semantics, handoff tags), and the TS and
Python test suites consume the same files, so behavioral drift fails CI
instead of surfacing as a per-client bug later.

Two things always stay client-side, in both languages: **sanitize** (secrets
must be filtered before data leaves the machine) and the **offline spool** (a
server cannot buffer for a client that is offline).

### Descriptors, not adapters, for config-only hosts

Separate what *behaves* differently; collapse into data what only *differs in
data*. Runtime clients (Claude Code, OpenClaw, Hermes) have real client-side
behavior and keep per-client runtimes. Config-only MCP hosts (Cursor, Codex)
differ only in packaging data — config file path and format, install command —
so each is a `defineMcpHostAgent()` descriptor rendered by one shared
implementation, not a hand-written adapter. Their optional capture hooks
(`hooks/hooks.json`) run a committed copy of `packages/stdio-runtime`'s bundle
rather than shipping a third runtime implementation.

### Failure-path spool and dreaming

Capture is RAM-first; disk is strictly the failure fallback. When a live
upload fails, the record is written to the disk spool instead of being
retained in RAM or dropped, so a process restart cannot lose it. The `dream`
command (`/membase:dream` in Claude Code, `openclaw membase dream`,
`hermes-membase dream`, the `/dream` prompt in Cursor/Codex) flushes that
spool. Flushing follows a claim/rename discipline (rename
`pending.jsonl` before uploading) so two concurrent flushers cannot send the
same record, and secret-looking records are reported to the user — never
uploaded, never silently deleted. Dreaming is flush-only; sweep/consolidation
is deliberately out of scope.

## Verification

The repo is guarded by a chain of CI checks (`pnpm check`). The
architecture-relevant ones are:

- **Public-surface guard** (`scripts/check-public-surface.sh`) scans adapter and
  core source plus generated public artifacts for forbidden internal
  implementation terms.
- **Generated-artifact verification** (`scripts/check-generated-artifacts.mjs`)
  imports each built client adapter and compares its default generated
  plugin/MCP artifacts against the committed files under `clients/*` and
  `manifests/*`, so reviewable examples stay aligned with the adapters.
- **Client smoke harness** (`smoke/client-smoke.mjs`) imports the built adapters
  and checks their public connector boundary — generated MCP config shape, no
  leaked secrets in configs or diagnostics, and declared smoke commands —
  without reaching private Membase internals.

## Secret Handling

Auth is OAuth per client; no user-supplied API key exists and no committed
config carries a credential. `packages/capture-core` redacts secret-shaped
values on the capture path before anything reaches disk or the network, the
smoke harness injects a fake sentinel secret and fails if any generated
artifact echoes it, and `scripts/check-secret-hygiene.mjs` scans the tree for
raw secret-looking values. See [security.md](security.md) for the full model.

## Untrusted Content Neutralization

Remembered content is untrusted: it can arrive via Slack/Gmail ingestion or
another client's captures. Every render site that puts memory, wiki, profile,
or handoff text into model context calls capture-core's `neutralizeInjection`
(Hermes: `neutralize_injection`), which makes `<membase-*>` and
`<system-reminder>` tags inert with a zero-width space. The rule is
golden-vector-bound across both languages
(`packages/capture-core/spec/sanitize-vectors.json`), and the capture path
strips injected `<membase-context>`/`<membase-handoff>` blocks so harness
output is not re-captured as memory.
