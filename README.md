# Membase Plugin/MCP

Canonical public repo for Membase agent connectors.

This repo is the integration surface for installing Membase into external AI
clients and MCP-capable agents. The initial target clients are Claude Code,
Cursor, Hermes Agent, and OpenClaw.

## Scope

- Shared auth, install, deep link, endpoint, and MCP configuration core.
- Client-specific adapters, manifests, and install docs.
- Smoke tests that prove each client can connect, write memory, search memory,
  and handle secrets safely.
- Migration path from existing client-specific repos.

## Non-goals

- Exposing Membase's internal memory schema, graph model, ranking pipeline, or
  storage layout.
- Replacing the Membase application repo.
- Turning this into a generic MCP directory.

## Repository Layout

```text
packages/core/          Shared auth, endpoint, config, and install primitives
packages/connector-sdk/ Public SDK for adding new agent connectors
clients/claude/         Claude Code plugin adapter, manifest, and MCP config
clients/cursor/         Cursor MCP config and adapter
clients/hermes/         Hermes Agent plugin adapter and manifest
clients/openclaw/       OpenClaw plugin adapter and manifest
manifests/              Generated or canonical plugin/MCP manifest examples
docs/install/           Client-specific install guides
docs/research/          OSS research notes and architecture references
docs/migration-parity.md Existing repo inventory and migration parity checklist
docs/test-coverage-parity.md Old repo test coverage migration map
smoke/                  Client compatibility and install smoke tests
scripts/                Repo maintenance, generation, and migration scripts
```

## Local Checks

This repo uses a small TypeScript workspace for shared connector packages.

```bash
pnpm install
pnpm check
```

`pnpm check` typechecks the shared packages and runs the public-surface guard.
It also verifies that committed client manifest and MCP examples match the
current adapter-generated output, checks the shared core auth/env/MCP/redaction
contract, then runs the client smoke harness in dry-run mode, the live-smoke
preflight, the runtime-decision ledger guard, the launch handoff consistency
guard, the packaging/action parity guard, the version parity guard, the Claude
plugin validation parity gate, the Claude
native artifact snapshot gate, the Cursor HTTP transport parity gate, the Cursor
native artifact snapshot gate, the Hermes Python parity gate, the Hermes native
artifact snapshot gate, the OpenClaw native artifact snapshot gate, the OpenClaw native
typecheck/build parity gate, the secret-hygiene
guard, and the review-readiness guard for required docs, install guides,
manifests, and client artifacts.

```bash
pnpm core:contract
pnpm smoke:dry-run
pnpm smoke:execute
pnpm smoke:live:preflight
pnpm runtime-decision-ledger
pnpm launch-handoff
pnpm version-parity
pnpm claude:plugin-parity
pnpm claude:native-artifacts
pnpm cursor:transport-parity
pnpm cursor:native-artifacts
pnpm hermes:python-parity
pnpm hermes:native-artifacts
pnpm openclaw:native-artifacts
pnpm openclaw:native-parity
```

`pnpm smoke:dry-run` validates adapter MCP config shape, declared smoke
commands, secret redaction, Cursor HTTP MCP shape, and the public
remember/search/context/forget contract through the local stub.
`pnpm smoke:execute` additionally runs the adapter-declared local commands.
Live MCP server exercise remains pending until the remaining client-specific
runtime behavior replaces placeholder MCP examples: Hermes runtime API
behavior and OpenClaw native hook/tool behavior. Claude's plugin-local stdio
config, Cursor's HTTP MCP config, Hermes' provider import/register boundary,
and OpenClaw's native extension entrypoint are already preserved from the old
repos.
The launch-gate runbook is
`docs/live-smoke-runbook.md`. `pnpm smoke:live:preflight` verifies that this
blocked state remains explicit until D2/D3 runtime decisions are implemented.

Current client package coverage:

- `@membase/client-claude`: adapter boundary, Claude plugin metadata, and MCP
  plugin-local config example, plus local Claude Code plugin validation and
  review-only native artifact snapshot parity gates.
- `@membase/client-cursor`: adapter boundary, Cursor plugin metadata, HTTP MCP
  config example, transport parity guard, and review-only native artifact
  snapshot for old rules, skills, logo, and changelog evidence.
- `@membase/client-hermes`: adapter boundary, Hermes plugin metadata, MCP
  config example, non-publishing Python package/provider boundary parity
  scaffold, and review-only native artifact snapshot for old provider, capture,
  OAuth, wiki, formatting, asset, update-check, and test evidence.
- `@membase/client-openclaw`: adapter boundary, OpenClaw plugin manifest,
  native extension entrypoint, MCP config example, and review-only native
  artifact snapshot for old commands, hooks, tools, config helpers, update
  checks, and runtime test evidence.

## Current Source of Truth

The Linear project is `Plugin/MCP 통합 레포 출시`.

For a human-readable snapshot of the current motivation, decisions, status, and
next steps, open `docs/context.html`.

For the accepted repo architecture and public/private connector boundary, open
`docs/architecture.md`.

For client install review flows, open `docs/install/claude.md`,
`docs/install/cursor.md`, `docs/install/hermes.md`, and
`docs/install/openclaw.md`.

For existing client repo inventory and migration parity status, open
`docs/migration-parity.md`.

For old repo test coverage mapping, open `docs/test-coverage-parity.md`.

For old repo packaging and non-publishing GitHub Action parity mapping, open
`docs/packaging-action-parity.md`.

For secret handling, redaction guarantees, and live MCP smoke prerequisites,
open `docs/security.md`.

For the live client-to-MCP smoke launch-gate runbook, open
`docs/live-smoke-runbook.md`.

For marketplace asset inventory and review blockers, open
`docs/marketplace-assets.md`.

For the non-mutating old repo deprecation and star-concentration plan, open
`docs/deprecation-plan.md`.

For remaining runtime parity and launch handoff decisions, open
`docs/runtime-parity-decisions.md`.

For the final Linear-ready review snapshot, open `docs/review-summary.md`.

The current backlog is:

- `MEM-327` - Plugin/MCP integration repo architecture decision
- `MEM-328` - Integrated Plugin/MCP repo scaffolding
- `MEM-329` - Shared auth/install/MCP core and client manifest integration
- `MEM-330` - Migrate four existing client plugin repos
- `MEM-331` - README, install docs, and marketplace assets
- `MEM-332` - Deprecate old plugin repos and concentrate GitHub stars
