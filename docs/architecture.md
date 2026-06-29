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
  compact Claude plugin manifest, generates plugin-local MCP config through
  `packages/core`, and passes local Claude Code plugin manifest validation.
- Cursor: `clients/cursor` now implements the SDK `ClientAdapter`, emits a
  compact Cursor plugin manifest, and preserves the old repo's HTTP MCP config
  at `https://mcp.membase.so/mcp` as the primary Cursor transport.
- Hermes Agent: `clients/hermes` now implements the SDK `ClientAdapter`, emits
  native Hermes plugin metadata, generates a shared MCP config example for
  Hermes config translation, and preserves an importable Python
  provider/register boundary without enabling live API calls. The old Hermes
  provider, capture, OAuth, wiki, formatting, asset, update-check, and test
  evidence is guarded as a review-only snapshot at
  `clients/hermes/native-artifacts.json`.
- OpenClaw: `clients/openclaw` now implements the SDK `ClientAdapter`, emits a
  native OpenClaw manifest placeholder, exports a native extension entrypoint,
  and generates a shared MCP config example for local connector testing.

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
generated-artifact, core-contract, smoke, secret-hygiene, public-surface, and
review-readiness guards wired together.

## Client Smoke Harness

`smoke/client-smoke.mjs` imports the built Claude, Cursor, Hermes, and OpenClaw
adapters and checks their public connector boundary without reaching private
Membase implementation details. The dry-run validates generated MCP config
shape, API key reference handling, redacted diagnostics, declared adapter smoke
commands, and the public remember/search/context/delete flow through
`smoke/public-contract-stub.mjs`.

The harness can execute adapter-declared local commands with
`pnpm smoke:execute`. Live client-to-MCP runtime checks remain pending until
the remaining client-specific runtime behavior and test credentials are
implemented: Hermes Python package/native provider and OpenClaw native
hook/tool behavior. Claude plugin-local stdio, Cursor HTTP MCP transport, and
OpenClaw native extension entrypoint are preserved locally, but live exercise
still needs the D6 test credential and cleanup decision.
The launch-gate shape for that future check is documented in
`docs/live-smoke-runbook.md`, including required decisions, test-only data,
cleanup behavior, and redacted logging.

## Live MCP Smoke Runbook

`docs/live-smoke-runbook.md` defines the pending live smoke implementation
contract for D2, D3, and D6. It keeps the future test limited to public
remember, search, context, forget, diagnostics, and cleanup behavior.

## Live Smoke Preflight

`smoke/live-smoke-preflight.mjs` keeps the current blocked state executable:
D2 records that Claude plugin-local, Cursor HTTP-first, Hermes provider
import/register, and OpenClaw native entrypoint paths are implemented while
Hermes runtime API behavior remains pending, D3 records that those primary
paths are preserved while fallback decisions remain pending, and D6 stays
accepted only in principle until the remaining runtime behavior and live
credentials are resolved. The preflight also verifies that Claude keeps the old
plugin-local MCP command, Cursor keeps the old HTTP MCP URL, OpenClaw keeps the
native entrypoint metadata, and the remaining placeholder MCP examples do not
pretend live smoke is runnable.

## Test Coverage Parity

`docs/test-coverage-parity.md` maps old Claude, Cursor, Hermes, and OpenClaw
repo checks into this integrated repo's verification model. Shared coverage
belongs at the public connector-contract boundary: config generation, auth env
references, redacted diagnostics, smoke behavior, and remember/search/context/
forget operations. Host-specific coverage belongs in client-native parity tests
only after the corresponding old commands, hooks, skills, providers, tools, or
rules are explicitly migrated.

The current repo covers generated artifacts, dry-run smoke behavior,
shared core auth/env/MCP/redaction contract behavior, secret-hygiene scanning,
and public-surface wording. Host CLI validation, display formatting fixtures,
and runtime hook/provider parity tests are still pending.

## Packaging and Action Parity

`docs/packaging-action-parity.md` records the old Claude, Cursor, Hermes, and
OpenClaw packaging and GitHub Action shape before any publishing or marketplace
workflow is enabled. `scripts/check-packaging-action-parity.mjs` keeps that map
present in `pnpm check` and verifies that publishing remains documented as
disabled until Jaehwan explicitly authorizes external mutations.
`pnpm claude:plugin-parity` validates the integrated Claude plugin metadata
with the installed Claude Code CLI and checks manifest/version/MCP secret
reference drift without marketplace submission.
`pnpm claude:native-artifacts` verifies the review-only snapshot at
`clients/claude/native-artifacts.json` for the old Claude commands, hooks,
skills, agent, bundled runtime scripts, and session-start evidence. It also
keeps generated Claude metadata free of premature native-behavior declarations
until those artifacts are explicitly accepted for migration.
`pnpm cursor:transport-parity` verifies that Cursor's committed MCP examples
preserve the old HTTP MCP endpoint and do not regress to the generic stdio
placeholder.
`pnpm cursor:native-artifacts` verifies the review-only snapshot at
`clients/cursor/native-artifacts.json` for the old Cursor rules, skills, logo,
and changelog artifacts. It also keeps generated Cursor metadata free of
`logo` or `icon` references until an asset file is copied and approved.
`pnpm hermes:python-parity` validates the Hermes Python package review
scaffold, console script entrypoints, native YAML package data, Python syntax,
provider import/register behavior, and non-publishing boundary.
`pnpm hermes:native-artifacts` verifies the review-only snapshot at
`clients/hermes/native-artifacts.json` for old Hermes provider, capture, CLI,
OAuth, wiki, formatting, banner asset, update-check, and runtime test evidence.
It also keeps deferred Hermes runtime modules uncopied until those behaviors
are explicitly accepted for migration.
`pnpm openclaw:native-artifacts` verifies the review-only snapshot at
`clients/openclaw/native-artifacts.json` for old OpenClaw commands, hooks,
tools, config helpers, update checks, and runtime test evidence. It also keeps
deferred OpenClaw runtime source directories uncopied until those behaviors are
explicitly accepted for migration.
`pnpm openclaw:native-parity` runs the integrated OpenClaw adapter
typecheck/build path, imports the built native extension entrypoint, and
verifies the native manifest remains a private, non-publishing review artifact.
`pnpm version-parity` verifies that the current review version stays synchronized
across workspace package manifests, public plugin manifest versions, Hermes
Python/YAML package metadata, and MCP client-version environment examples. It
does not decide a release tag or enable publishing.

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

## Runtime Parity Decision Ledger

`docs/runtime-parity-decisions.md` now records the remaining public repo URL,
client runtime package paths, transport precedence, client-native runtime
parity, asset reuse, and live smoke decisions that must be accepted before any
external launch or old-repo mutation work.
`scripts/check-runtime-decision-ledger.mjs` keeps those D1-D6 statuses wired
into `pnpm check`, including the current blocked live-smoke state and the
non-mutating review boundary.

## Launch Handoff Consistency

`scripts/check-launch-handoff-consistency.mjs` keeps the accepted D1 public
repository URL synchronized across the runtime ledger, marketplace asset
checklist, deprecation plan, and Linear-ready review summary. It deliberately
keeps the release tag or bundle path pending until a launch-time decision is
made.

## Linear-Ready Summary

`docs/review-summary.md` is the current final review snapshot for the Linear
project. It maps the scheduled definition of done to concrete repo evidence,
records remaining runtime-parity decisions, and confirms that publication,
marketplace, GitHub, Linear, merge, and old-repo mutation actions remain out of
scope for this local loop.

## Secret Handling

`docs/security.md` is the current security and secret-handling contract for the
integrated repo. The public connector model keeps raw API keys outside
committed manifests and MCP examples by emitting environment references such as
`${MEMBASE_API_KEY}` for local-runtime examples; Cursor's current HTTP MCP
example has no local API-key field. `packages/core` redacts diagnostic
environment values for sensitive key names, the smoke harness checks the
redaction path with a fake sentinel secret, and
`scripts/check-secret-hygiene.mjs` scans connector artifacts for raw
secret-looking values during `pnpm check`.
