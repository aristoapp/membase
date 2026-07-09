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

## Public Capability Contract

The connector contract is deliberately small:

- save a memory or observation (`remember`)
- search memory (`search`)
- request task context (`getContext`)
- delete or forget a memory (`deleteOrForget`)
- report client and install diagnostics

## Adapter Contract

Each client adapter defines:

- install target paths
- manifest shape
- MCP server config shape
- hook support
- environment variable handling
- smoke-test commands

## Repo Boundary

Shared behavior belongs in `packages/core`, `packages/connector-sdk`, and
`packages/capture-core`.
Client-specific behavior belongs in `clients/{claude,cursor,codex,hermes,openclaw}`.
Generated or canonical examples belong in `manifests/`.

`packages/core` owns the concrete runtime config primitives: connector
identity, endpoint base URL and timeout, the API-key environment variable name,
MCP server config generation, and redacted environment display for diagnostics.
It may generate client-safe config objects, but it must not import or describe
Membase storage, ranking, graph, embedding, or governance internals.

`packages/connector-sdk` owns the adapter-facing extension surface. Each adapter
receives a `ConnectorRuntimeConfig`, emits a client manifest or MCP config, and
declares smoke-test commands. Config-only MCP hosts can be added as a
`defineMcpHostAgent()` descriptor rather than a hand-written adapter (see
[Design decisions](#descriptors-not-adapters-for-config-only-hosts)).

`packages/capture-core` owns the shared client-side capture runtime: secret
sanitize, capture kinds, the disk spool, buffering/retry, recall assembly, and
the OAuth-refreshing HTTP transport (see
[Design decisions](#shared-capture-core-per-host-adapters)).

## Client Adapters

- **Claude Code** (`clients/claude`) — implements the SDK `ClientAdapter`,
  emits a compact Claude plugin manifest, and generates a plugin-local (stdio)
  MCP config.
- **Cursor** (`clients/cursor`) — implements the SDK adapter and uses the hosted
  HTTP MCP endpoint at `https://mcp.membase.so/mcp` as the primary transport.
- **Codex CLI** (`clients/codex`) — points Codex directly at the streamable-HTTP
  MCP endpoint; auth via Codex-managed OAuth.
- **Hermes Agent** (`clients/hermes`) — ships a native Python provider and
  generates a shared MCP config example for Hermes config translation.
- **OpenClaw** (`clients/openclaw`) — ships a native TypeScript extension
  entrypoint and generates a shared MCP config example.

## Design decisions

The durable decisions that shaped the repo. Source comments cite them by
number from the retired internal decision log:

- **ADR 0001** → [Boundary](#boundary) and
  [Public Capability Contract](#public-capability-contract) above
- **ADR 0002** → [Shared capture core](#shared-capture-core-per-host-adapters)
  and [Two languages, one behavior](#two-languages-one-behavior)
- **ADR 0003** → [Descriptors, not adapters](#descriptors-not-adapters-for-config-only-hosts)
- **ADR 0005** → [Failure-path spool and dreaming](#failure-path-spool-and-dreaming)

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
implementation, not a hand-written adapter.

### Failure-path spool and dreaming

Capture is RAM-first; disk is strictly the failure fallback. When a live
upload fails, the record is written to the disk spool instead of being
retained in RAM or dropped, so a process restart cannot lose it. The `dream`
command flushes that spool. Flushing follows a claim/rename discipline (rename
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
  and checks their public connector boundary — generated MCP config shape, API
  key reference handling, redacted diagnostics, declared smoke commands, and the
  public remember/search/context/forget flow through
  `smoke/public-contract-stub.mjs` — without reaching private Membase internals.

## Secret Handling

`packages/core` redacts diagnostic environment values for sensitive key names,
the smoke harness verifies the redaction path with a fake sentinel secret, and
`scripts/check-secret-hygiene.mjs` scans connector artifacts for raw
secret-looking values. Connectors reference environment variables such as
`${MEMBASE_API_KEY}` rather than values. See [security.md](security.md) for the
full model.
