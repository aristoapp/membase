# Architecture

## Current Decision

The accepted local architecture decision is
[`docs/adr/0001-integrated-connector-repo.md`](adr/0001-integrated-connector-repo.md).

This repo is the public integration surface for the Linear project
`Plugin/MCP 통합 레포 출시`. It is not a product-positioning pivot and should not
grow into a generic MCP directory.

## Positioning

This repo is an outbound agent connector kit for Membase. It lets external
agents connect to Membase without exposing Membase's internal memory structure.

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

## Public Capability Contract

The connector contract should remain small:

- save memory or observation
- search memory
- request task context
- delete or forget a memory
- report client and install diagnostics

## Adapter Contract

Each client adapter should define:

- install target paths
- manifest shape
- MCP server config shape
- hook support
- environment variable handling
- smoke-test commands

## Repo Boundary

Shared behavior belongs in `packages/core` and `packages/connector-sdk`.
Client-specific behavior belongs in `clients/{claude,cursor,hermes,openclaw}`.
Generated or canonical examples belong in `manifests/`.

Public connector APIs may describe capabilities and diagnostics, but they must
not describe the private storage schema, graph model, embedding layout, ranking
pipeline, or internal memory engine.

## Shared Core Implementation Path

`packages/core` owns the concrete runtime config primitives:

- connector identity
- endpoint base URL and timeout
- API-key environment variable name
- MCP server config document generation
- redacted environment display for diagnostics

`packages/connector-sdk` owns the adapter boundary that client packages should
implement. Each adapter receives a `ConnectorRuntimeConfig`, emits a client
manifest or MCP config, and declares smoke-test commands. Client packages should
depend on the SDK instead of rebuilding config or secret-handling behavior.

## Client Adapter Status

- Claude Code: `clients/claude` now implements the SDK `ClientAdapter`, emits a
  compact Claude plugin manifest, and generates an MCP config document through
  `packages/core`.
- Cursor: `clients/cursor` now implements the SDK `ClientAdapter`, emits a
  compact Cursor plugin manifest, and generates a Cursor-compatible stdio MCP
  config document with Cursor environment interpolation.
- Hermes Agent: `clients/hermes` now implements the SDK `ClientAdapter`, emits
  native Hermes plugin metadata, and generates a shared MCP config example for
  Hermes config translation.
- OpenClaw: `clients/openclaw` now implements the SDK `ClientAdapter`, emits a
  native OpenClaw manifest placeholder, and generates a shared MCP config
  example for local connector testing.

## Migration Parity Status

`docs/migration-parity.md` now tracks `MEM-330` by inventorying the existing
Claude, Cursor, Hermes, and OpenClaw repos and separating what is already
represented in this integrated repo from what still needs runtime or launch
parity decisions.

## Generated Artifact Verification

`scripts/check-generated-artifacts.mjs` imports each built client adapter and
compares the default generated plugin/MCP artifacts against the committed files
under `clients/*` and `manifests/*`. This keeps reviewable examples aligned
with the shared adapter implementation before deeper runtime parity work.

## Review-Readiness Verification

`scripts/check-review-readiness.mjs` verifies that the integrated repo still has
the required architecture, migration parity, test coverage parity, security,
marketplace, deprecation, install, client, and manifest artifacts for local
review. It also checks that every client install guide includes the shared
secret-reference and local verification markers, and that `pnpm check` keeps
generated-artifact, smoke, secret-hygiene, public-surface, and review-readiness
guards wired together.

## Client Smoke Harness

`smoke/client-smoke.mjs` imports the built Claude, Cursor, Hermes, and OpenClaw
adapters and checks their public connector boundary without reaching private
Membase implementation details. The dry-run validates generated MCP config
shape, API key reference handling, redacted diagnostics, declared adapter smoke
commands, and the public remember/search/context/delete flow through
`smoke/public-contract-stub.mjs`.

The harness can execute adapter-declared local commands with
`pnpm smoke:execute`. Live client-to-MCP runtime checks remain pending until the
shared `@membase/mcp-server` package path is available.

## Test Coverage Parity

`docs/test-coverage-parity.md` maps old Claude, Cursor, Hermes, and OpenClaw
repo checks into this integrated repo's verification model. Shared coverage
belongs at the public connector-contract boundary: config generation, auth env
references, redacted diagnostics, smoke behavior, and remember/search/context/
forget operations. Host-specific coverage belongs in client-native parity tests
only after the corresponding old commands, hooks, skills, providers, tools, or
rules are explicitly migrated.

The current repo covers generated artifacts, dry-run smoke behavior,
secret-hygiene scanning, and public-surface wording. Focused core unit tests,
host CLI validation, display formatting fixtures, and runtime hook/provider
parity tests are still pending.

## Install Documentation Status

Claude, Cursor, Hermes, and OpenClaw install guides now cover config placement
or native metadata placement, secret references, generated artifact checks,
local smoke verification, and review checklists for `MEM-331`. Hermes includes
MCP JSON to `mcp_servers` YAML translation notes. OpenClaw keeps native plugin
manifest setup separate from shared MCP config placement.

## Marketplace Asset Status

`docs/marketplace-assets.md` now tracks the `MEM-331` marketplace pass. It
records reusable old assets, rewritten connector-capability copy, client-specific
publishing blockers, and the verification gate for future logo/icon changes.
The current decision is to keep Cursor's old logo and Hermes' old banner as
review candidates only; neither is referenced by generated manifests until the
asset file is ported and checked locally.

## Deprecation Planning Status

`docs/deprecation-plan.md` now tracks `MEM-332` as a non-mutating old repo
deprecation and star-concentration plan. It defines readiness gates, README
notice PR sequencing, compatibility-window expectations, archive prerequisites,
and per-client handoff blockers for Claude, Cursor, Hermes, and OpenClaw.

## Secret Handling

`docs/security.md` is the current security and secret-handling contract for the
integrated repo. The public connector model keeps raw API keys outside committed
manifests and MCP examples by emitting environment references such as
`${MEMBASE_API_KEY}` or Cursor's `${env:MEMBASE_API_KEY}`. `packages/core`
redacts diagnostic environment values for sensitive key names, the smoke
harness checks the redaction path with a fake sentinel secret, and
`scripts/check-secret-hygiene.mjs` scans connector artifacts for raw
secret-looking values during `pnpm check`.
