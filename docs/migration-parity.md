# Migration Inventory and Parity Checklist

This document tracks `MEM-330`: migrating the four existing client connector
repos into this integrated Plugin/MCP repo.

Scope for this file:

- Inventory old public repo artifacts.
- Map each artifact to the integrated repo target.
- Record migration gaps before runtime code or launch copy is moved.

Out of scope for this file:

- Publishing packages or marketplace listings.
- Deprecating old repos.
- Copying private implementation details into public connector APIs.

## Migration Rules

- Use the Linear project `Plugin/MCP 통합 레포 출시` as source of truth.
- Keep public APIs at the connector-capability level: remember, search, task
  context, forget, diagnostics, manifests, and install config.
- Do not port implementation-specific public copy unless it is rewritten as
  connector capability copy.
- Do not commit secrets, token values, or user-specific config.
- Prefer `packages/core` and `packages/connector-sdk` for shared behavior.
- Keep client-native behavior under `clients/{claude,cursor,hermes,openclaw}`.

## Evidence Snapshot

Checked on 2026-06-28 with GitHub API tree and metadata reads.

| Source repo | Evidence checked | Current shape |
| --- | --- | --- |
| `aristoapp/claude-membase` | Repo tree, root `package.json`, `plugin/package.json`, `plugin/.claude-plugin/plugin.json`, `plugin/.mcp.json` | TypeScript/Bun Claude plugin with commands, hooks, skills, source modules, tests, marketplace metadata, and manifest validation scripts. |
| `aristoapp/cursor-membase` | Repo tree, `.cursor-plugin/plugin.json`, `mcp.json` | Cursor plugin bundle with plugin metadata, remote MCP config, rules, skills, logo asset, and changelog. |
| `aristoapp/hermes-membase` | Repo tree, `pyproject.toml`, `src/membase_hermes/plugin/plugin.yaml` | Python Hermes provider package with CLI entrypoints, installer, provider/capture modules, tests, and native plugin YAML. |
| `aristoapp/openclaw-membase` | Repo tree, `package.json`, `openclaw.plugin.json` | TypeScript OpenClaw plugin with extension entrypoint, config, hooks, commands, tools, skills, tests, and native manifest. |

Primary evidence links:

- https://github.com/aristoapp/claude-membase
- https://github.com/aristoapp/cursor-membase
- https://github.com/aristoapp/hermes-membase
- https://github.com/aristoapp/openclaw-membase

## Shared Parity Checklist

- [x] Integrated repo has shared package/client/docs/smoke layout.
- [x] `packages/core` owns endpoint, auth environment, MCP config generation,
  validation, and redacted diagnostics.
- [x] `packages/connector-sdk` owns the `ClientAdapter` boundary.
- [x] Claude, Cursor, Hermes, and OpenClaw have adapter packages.
- [x] Claude, Cursor, Hermes, and OpenClaw have reviewable manifest/config
  placeholders.
- [x] Claude, Cursor, Hermes, and OpenClaw have install docs.
- [x] Claude and Cursor install docs cover config placement, secret references,
  generated artifact checks, and local smoke verification.
- [x] Hermes and OpenClaw install docs cover native metadata placement, MCP
  config translation, secret references, generated artifact checks, local smoke
  verification, and review checklists.
- [x] Old four repos have an initial artifact inventory.
- [x] Draft marketplace asset checklist with reusable old assets, rewritten
  connector-capability copy, and client-specific publishing blockers.
- [x] Draft old repo deprecation and star-concentration plan with non-mutating
  review steps, archive prerequisites, and per-client handoff blockers.
- [ ] Decide final public host/config compatibility for old `membase.so`
  metadata versus the current integrated default.
- [ ] Decide final MCP transport per client: remote URL, local package stdio,
  or both with clear precedence.
- [ ] Normalize package and manifest versioning across all client surfaces.
- [ ] Port safe marketplace assets and descriptions after rewriting public copy
  to the connector-capability boundary.
- [x] Add generated-artifact checks so adapter output matches committed
  manifest/config examples.
- [x] Add smoke fixtures that exercise remember, search, context, forget, and
  secret redaction against a stub or test endpoint.
- [x] Document secret handling, redaction guarantees, local env setup, and live
  MCP smoke prerequisites.
- [x] Map old test coverage to this repo's public contract tests in
  `docs/test-coverage-parity.md`.

## Client Parity Matrix

| Client | Already represented here | Still to migrate or decide |
| --- | --- | --- |
| Claude Code | `clients/claude` adapter, plugin metadata, MCP config example, install doc, workspace typecheck, public-surface guard. | Decide whether Claude commands, skills, agents, hooks, session-start behavior, project scoping, status/login/logout flows, and manifest validation scripts move here, become shared smoke tests, or stay deprecated with old repos. |
| Cursor | `clients/cursor` adapter, Cursor plugin metadata, plugin-local MCP config, reviewable manifest copies, install doc, workspace typecheck, public-surface guard. | Port or rewrite rules, skills, logo asset, changelog-relevant launch notes, and remote MCP URL compatibility. Remove implementation-specific claims from marketplace copy. |
| Hermes Agent | `clients/hermes` adapter, native plugin YAML placeholder, MCP config example, install doc, workspace typecheck, public-surface guard. | Decide whether the Python provider package is migrated into this repo, kept as a package dependency, or replaced by MCP-only config. Map installer, provider tools, capture behavior, OAuth flow, update check, and tests. |
| OpenClaw | `clients/openclaw` adapter, native manifest placeholder, MCP config example, install doc, workspace typecheck, public-surface guard. | Port or replace extension entrypoint, hooks, commands, tools, skills, OAuth/token config fields, update checks, and OpenClaw runtime tests. Decide whether env-only MCP auth is enough for the native plugin path. |

## Test Coverage Parity Status

`docs/test-coverage-parity.md` now maps old repo tests and checks into shared
connector-contract coverage, client-native parity tests, launch validation, or
deferred runtime decisions. The key outcome is that old hook, provider, tool,
skill, wiki, project, and display-format tests should not be blindly ported
into shared core tests; they need explicit client-runtime migration decisions
first.

## Per-Client Details

### Claude Code

Old repo obligations:

- Marketplace and plugin metadata.
- Local MCP server packaging.
- Commands for login, logout, status, recall, remember, wiki, project config,
  and project indexing.
- Skills for memory hygiene, project context, recall, remember, and wiki.
- Hook/runtime behavior for session start and transcript handling.
- Sanitization, local spool, project/profile config, update check, and tests.

Integrated target:

- Keep generated metadata and MCP config in `clients/claude` and
  `manifests/claude`.
- Put shared auth/config behavior in `packages/core`.
- Add command/skill/hook parity only after each behavior is mapped to the
  public connector contract.

### Cursor

Old repo obligations:

- Cursor plugin metadata.
- MCP config.
- Rules and skills.
- Logo asset and launch copy.

Integrated target:

- Keep Cursor metadata and MCP config in `clients/cursor` and
  `manifests/cursor`.
- Add rules and skills only after public copy is rewritten around connector
  capabilities.
- Decide whether to keep a remote MCP URL option alongside the local stdio
  package path.

### Hermes Agent

Old repo obligations:

- Python package metadata and CLI entrypoints.
- Native Hermes plugin YAML.
- Installer, provider, capture, mirror, OAuth, wiki, formatting, update check,
  and tests.

Integrated target:

- Keep Hermes control-plane metadata in `clients/hermes`.
- Track whether the Python runtime remains a package dependency or migrates
  into the integrated repo.
- Add tests at the connector contract boundary before porting runtime internals.

### OpenClaw

Old repo obligations:

- OpenClaw package metadata and extension entrypoint.
- Native manifest with config schema.
- Commands, hooks, tools, skills, update check, and runtime tests.

Integrated target:

- Keep native manifest and MCP config under `clients/openclaw`.
- Decide the native auth model before porting config schema fields.
- Port hook/tool behavior only when it can call the shared connector core
  without exposing Membase internals.

## Next Migration Step

Start `PLAN.md` run 19 with end-to-end local verification and a review-readiness
gap pass across README, architecture docs, generated artifacts, smoke checks,
marketplace assets, migration parity, and deprecation planning.
