# Architecture

The accepted architecture decision is
[`docs/adr/0001-integrated-connector-repo.md`](adr/0001-integrated-connector-repo.md).
This document summarizes the resulting shape.

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

Shared behavior belongs in `packages/core` and `packages/connector-sdk`.
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
[ADR 0003](adr/0003-agents-as-descriptors.md)).

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
