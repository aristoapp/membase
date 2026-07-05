# Integration Plan

## Objective

Create one local integrated Plugin/MCP repo for Membase that follows the Linear
project description exactly: architecture decision, scaffolding, shared core,
client migration, install docs, marketplace assets, and old-repo deprecation.

## Working Principle

Expose connector capabilities, not Membase internals. External contributors
should be able to add or maintain agent connectors without seeing the private
memory engine, graph schema, embedding layout, or ranking logic.

Public surface:

- `remember`
- `search`
- `getContext`
- `deleteOrForget`
- client manifest/config generation
- client smoke tests

Private surface:

- memory storage schema
- graph structure
- embedding/chunking implementation
- ranking and freshness algorithm
- internal governance implementation

## Development Workflow

Interactive sessions in **Cursor** or **Claude Code** own all implementation
work in this repo.

- **Branch**: `feature/<group>-<short-name>` off `main` (example:
  `feature/group-e1-agent-descriptors`).
- **Commits**: small, logical units with Conventional Commit prefixes (`feat:`,
  `fix:`, `refactor:`, `chore:`, `docs:`).
- **Before PR**: run `pnpm check`; add `pnpm smoke:execute` when runtime paths
  change.
- **PR**: one focused change set; link the relevant ADR or Linear issue when
  useful.
- **History**: git log and PR descriptions are the source of truth. `RUN_LOG.md`
  is a historical archive from the retired Codex automation scaffold phase only.

### Retired: Codex scheduled loop

The 20-run LaunchAgent/Codex automation loop is **retired** (2026-07-05). Do not
re-enable it. The scaffold allocation below is kept only as archive context.

<details>
<summary>Archived 20-run scaffold allocation (historical)</summary>

Each scheduled run used to:

1. Read this file, `RUN_LOG.md`, and current repo state.
2. Inspect the relevant Linear issue scope.
3. Do fresh OSS research when useful.
4. Implement the smallest useful next step.
5. Run available local checks.
6. Append a concise entry to `RUN_LOG.md`.

Run allocation:

1. Architecture options and decision record.
2. OSS repo structure research.
3. Package/workspace tooling scaffold.
4. Shared core API shape.
5. Shared auth and endpoint config model.
6. MCP config generation model.
7. Claude adapter skeleton.
8. Cursor adapter skeleton.
9. Hermes adapter skeleton.
10. OpenClaw adapter skeleton.
11. Existing repo inventory.
12. Migration parity checklist.
13. Client smoke test harness.
14. Secret handling and security docs.
15. Install docs for Claude and Cursor.
16. Install docs for Hermes and OpenClaw.
17. Marketplace asset checklist.
18. Old repo deprecation plan.
19. End-to-end local verification.
20. Final repo quality pass and Linear-ready summary.

</details>

## Post-20 Runtime Parity Plan

The scheduled scaffold/review loop is complete. Follow-up work should now move
from skeleton review readiness into runtime parity, while preserving the
existing client-specific packaging paths instead of forcing every client through
one generic MCP package.

### Runtime Packaging Principle

Respect the old connector's runtime path unless a client-specific review proves
there is a better replacement:

- Claude Code keeps the Claude plugin packaging model and plugin-local stdio
  runtime path first. The old repo used Bun/TypeScript checks, Claude plugin
  validation, and a plugin-local MCP command:
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`.
- Cursor keeps the HTTP MCP endpoint path first because the old repo's
  `mcp.json` pointed at `https://mcp.membase.so/mcp`. Local stdio can be added
  only as an explicit secondary path.
- Hermes keeps the Python package path first: `hermes-membase` and
  `hermes-membase-install`, with build/test/verify-dist checks before any
  publish workflow is enabled.
- OpenClaw keeps the native OpenClaw extension package path first:
  `@membase/openclaw-membase`, `openclaw.plugin.json`, and the extension
  entrypoint.

### Next Implementation Sequence

1. Add a packaging/action parity map for the four old repos:
   - Claude: Bun check plus Claude plugin validation.
   - Cursor: no old GitHub Action found; preserve plugin metadata, HTTP MCP
     config, rules, skills, logo, and changelog as reviewable artifacts.
   - Hermes: Python build/test/typecheck/lint/verify-dist and publish workflow
     shape, with publishing disabled until explicitly requested.
   - OpenClaw: Bun install, typecheck, build, and native manifest validation.
2. Move non-publishing GitHub Actions into this repo as local parity checks
   before any publish, marketplace, old-repo, or Linear mutation.
3. Replace the current placeholder MCP runtime assumption with per-client
   generated runtime configs:
   - Claude plugin-local stdio.
   - Cursor HTTP MCP first.
   - Hermes Python package/native provider path.
   - OpenClaw native extension package path.
4. Expand smoke coverage from preflight to per-client runtime smoke only after
   each runtime path has a local, test-only execution path.
5. Port client-native features only after they are explicitly accepted into the
   integrated repo:
   - Claude commands, hooks, skills, agents, and session-start behavior.
   - Cursor rules, skills, logo, and HTTP/local fallback docs.
   - Hermes provider, installer, capture, OAuth, wiki, and formatting behavior.
   - OpenClaw hooks, commands, tools, skills, config schema, and extension
     entrypoint.
6. Keep non-runtime launch metadata reviewable with local guards, including
   version parity across package manifests, plugin manifests, Hermes YAML, and
   MCP client-version environment examples.

### Current Runtime Gate

`pnpm smoke:live:preflight` is the correct blocked-state check until the
per-client runtime paths above are implemented. A real `pnpm smoke:live` should
not be added until it can exercise test-only data and cleanup through the
accepted client runtime paths.

`pnpm version-parity` is the correct local guard for the current review version.
It verifies that package versions, public plugin manifest versions, Hermes
Python/YAML versions, and MCP client-version examples stay synchronized without
deciding a release tag or enabling publication.

## Stop Conditions

The repo is ready when:

- A clear architecture decision exists.
- The local repo has a package/client/docs/smoke structure.
- Each of the four target clients has an adapter boundary and install doc.
- Shared auth/install/MCP config logic has an implementation path.
- Internal memory structure is not exposed through public connector APIs.
- Old repo migration and deprecation are documented.
