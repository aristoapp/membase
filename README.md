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
current adapter-generated output, then runs the client smoke harness in dry-run
mode, the secret-hygiene guard, and the review-readiness guard for required
docs, install guides, manifests, and client artifacts.

```bash
pnpm smoke:dry-run
pnpm smoke:execute
```

`pnpm smoke:dry-run` validates adapter MCP config shape, declared smoke
commands, secret redaction, and the public remember/search/context/forget
contract through the local stub. `pnpm smoke:execute` additionally runs the
adapter-declared local commands. Live MCP server exercise remains pending until
the shared `@membase/mcp-server` package path is available.

Current client package coverage:

- `@membase/client-claude`: adapter boundary, Claude plugin metadata, and MCP
  config example.
- `@membase/client-cursor`: adapter boundary, Cursor plugin metadata, and MCP
  config example.
- `@membase/client-hermes`: adapter boundary, Hermes plugin metadata, and MCP
  config example.
- `@membase/client-openclaw`: adapter boundary, OpenClaw plugin manifest, and
  MCP config example.

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

For secret handling, redaction guarantees, and live MCP smoke prerequisites,
open `docs/security.md`.

For marketplace asset inventory and review blockers, open
`docs/marketplace-assets.md`.

For the non-mutating old repo deprecation and star-concentration plan, open
`docs/deprecation-plan.md`.

The current backlog is:

- `MEM-327` - Plugin/MCP integration repo architecture decision
- `MEM-328` - Integrated Plugin/MCP repo scaffolding
- `MEM-329` - Shared auth/install/MCP core and client manifest integration
- `MEM-330` - Migrate four existing client plugin repos
- `MEM-331` - README, install docs, and marketplace assets
- `MEM-332` - Deprecate old plugin repos and concentrate GitHub stars
