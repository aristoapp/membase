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
- [ ] Preserve and document final transport per client: Claude plugin-local
  stdio and Cursor HTTP MCP first are reflected in generated config examples;
  Hermes provider import/register behavior is represented locally; OpenClaw
  native extension entrypoint is reflected in package metadata; Hermes live API
  behavior and OpenClaw hook/tool behavior remain pending.
- [ ] Migrate old repo GitHub Actions into this repo as non-publishing parity
  checks before enabling any publish or marketplace workflow.
- [x] Add the Claude plugin parity gate:
  `pnpm claude:plugin-parity` for local Claude Code plugin validation,
  manifest/version drift, and MCP secret-reference checks without marketplace
  submission.
- [x] Add the Claude native artifact snapshot:
  `clients/claude/native-artifacts.json` plus
  `pnpm claude:native-artifacts` for old commands, hooks, skills, agent,
  bundled runtime scripts, and session-start evidence before any behavior is
  ported.
- [x] Add the Hermes Python package/provider parity gate:
  `pnpm hermes:python-parity` for package metadata, console script entrypoints,
  native YAML package data, Python syntax, provider import/register behavior,
  and non-publishing checks.
- [x] Add the Hermes native artifact snapshot:
  `clients/hermes/native-artifacts.json` plus
  `pnpm hermes:native-artifacts` for old provider, capture, CLI, OAuth, wiki,
  formatting, banner asset, update-check, and runtime test evidence before any
  behavior is ported.
- [x] Add the Cursor HTTP transport parity gate:
  `pnpm cursor:transport-parity` for preserving the old HTTP MCP endpoint in
  committed Cursor config examples.
- [x] Add the Cursor native artifact snapshot:
  `clients/cursor/native-artifacts.json` plus `pnpm cursor:native-artifacts`
  for old rules, skills, logo, and changelog evidence before any copy is
  ported.
- [x] Add the first host-specific local parity gate:
  `pnpm openclaw:native-parity` for OpenClaw typecheck/build, native
  extension entrypoint, and manifest/package non-publishing checks.
- [x] Add the OpenClaw native artifact snapshot:
  `clients/openclaw/native-artifacts.json` plus
  `pnpm openclaw:native-artifacts` for old commands, hooks, tools, config,
  update checks, and runtime test evidence before any behavior is ported.
- [x] Normalize package and manifest versioning across all review surfaces with
  `pnpm version-parity`, covering workspace package versions, public plugin
  manifest versions, Hermes Python/YAML package metadata, and MCP
  client-version examples without deciding a release tag.
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
- [x] Add a packaging/action parity map in
  `docs/packaging-action-parity.md`, guarded by
  `scripts/check-packaging-action-parity.mjs`.

## Client Parity Matrix

| Client | Already represented here | Still to migrate or decide |
| --- | --- | --- |
| Claude Code | `clients/claude` adapter, plugin metadata, plugin-local MCP config example, install doc, workspace typecheck, `pnpm claude:plugin-parity`, Claude native artifact snapshot, public-surface guard. | Decide whether Claude commands, skills, agents, hooks, session-start behavior, project scoping, and status/login/logout flows move here, become shared smoke tests, or stay deprecated with old repos. |
| Cursor | `clients/cursor` adapter, Cursor plugin metadata, HTTP MCP config, reviewable manifest copies, install doc, workspace typecheck, `pnpm cursor:transport-parity`, Cursor native artifact snapshot, public-surface guard. | Port or rewrite rules, skills, logo asset, and changelog-relevant launch notes. Remove implementation-specific claims from marketplace copy. |
| Hermes Agent | `clients/hermes` adapter, native plugin YAML placeholder, MCP config example, install doc, workspace typecheck, Hermes Python package/provider boundary parity gate, Hermes native artifact snapshot, public-surface guard. | Decide whether the Python provider live behavior is fully migrated into this repo, kept as a package dependency, or replaced by MCP-only config. Map provider tools, capture behavior, OAuth flow, update check, and tests. |
| OpenClaw | `clients/openclaw` adapter, native manifest placeholder, MCP config example, install doc, workspace typecheck, OpenClaw native typecheck/build plus extension entrypoint parity gate, OpenClaw native artifact snapshot, public-surface guard. | Port or replace hooks, commands, tools, skills, OAuth/token config fields, update checks, and OpenClaw runtime tests. Decide whether env-only MCP auth is enough for the native plugin path. |

## Test Coverage Parity Status

`docs/test-coverage-parity.md` now maps old repo tests and checks into shared
connector-contract coverage, client-native parity tests, launch validation, or
deferred runtime decisions. The key outcome is that old hook, provider, tool,
skill, wiki, project, and display-format tests should not be blindly ported
into shared core tests; they need explicit client-runtime migration decisions
first.

## Packaging and Action Parity Status

`docs/packaging-action-parity.md` now maps old repo package scripts and GitHub
Action shapes into local, non-publishing parity targets. Claude and OpenClaw
have old check workflows, Cursor has no old workflow found, and Hermes has a
publish workflow that must remain disabled until explicitly authorized.
Claude, Cursor, Hermes, and OpenClaw now have concrete local parity gates via
`pnpm claude:plugin-parity`, `pnpm cursor:transport-parity`,
`pnpm hermes:python-parity`, `pnpm hermes:native-artifacts`,
`pnpm openclaw:native-artifacts`, and `pnpm openclaw:native-parity`.
`pnpm version-parity` keeps package and
manifest review versions synchronized while release tagging remains a launch
decision. The broader GitHub Actions migration remains incomplete until Cursor
rules/skills/assets are ported safely and client-native runtime behavior is
explicitly accepted.

## Per-Client Details

### Claude Code

Old repo obligations:

- Marketplace and plugin metadata.
- Local MCP server packaging.
- Bun `check` workflow and Claude plugin validation workflow.
- Commands for login, logout, status, recall, remember, wiki, project config,
  and project indexing.
- Skills for memory hygiene, project context, recall, remember, and wiki.
- Hook/runtime behavior for session start and transcript handling.
- Sanitization, local spool, project/profile config, update check, and tests.

Integrated target:

- Keep generated metadata and MCP config in `clients/claude` and
  `manifests/claude`.
- Keep `clients/claude/native-artifacts.json` as the Claude native artifact
  snapshot until old commands, hooks, skills, agents, bundled scripts, or
  session-start behavior are accepted for migration.
- Preserve the plugin-local stdio runtime path; the generated config now points
  at `node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`.
- Keep Claude validation parity as a non-publishing repo check through
  `pnpm claude:plugin-parity`.
- Put shared auth/config behavior in `packages/core`.
- Add command/skill/hook parity only after each behavior is mapped to the
  public connector contract.

### Cursor

Old repo obligations:

- Cursor plugin metadata.
- HTTP MCP config at `https://mcp.membase.so/mcp`.
- Rules and skills.
- Logo asset and launch copy.

Integrated target:

- Keep Cursor metadata and MCP config in `clients/cursor` and
  `manifests/cursor`.
- Preserve HTTP MCP as the primary Cursor transport unless a later review
  explicitly changes it; `pnpm cursor:transport-parity` now guards this.
- Keep `clients/cursor/native-artifacts.json` as the Cursor native artifact
  snapshot until old rules, skills, logo, or changelog copy is rewritten and
  accepted.
- Add rules and skills only after public copy is rewritten around connector
  capabilities.
- Add local stdio only as a documented secondary path if Cursor review needs it.

### Hermes Agent

Old repo obligations:

- Python package metadata and CLI entrypoints.
- Build/test/typecheck/lint/verify-dist checks and PyPI publish workflow shape.
- Native Hermes plugin YAML.
- Installer, provider, capture, mirror, OAuth, wiki, formatting, update check,
  and tests.

Integrated target:

- Keep Hermes control-plane metadata in `clients/hermes`.
- Preserve the Python package/provider path first and migrate publish workflow
  shape as disabled/non-publishing review infrastructure.
- Keep `clients/hermes/python/` as the local non-publishing package/provider
  review scaffold while live runtime behavior migration remains pending.
- Keep `clients/hermes/native-artifacts.json` as the Hermes native artifact
  snapshot until old provider, capture, CLI, OAuth, wiki, formatting, asset,
  update-check, or tests are accepted for migration.
- Add tests at the connector contract boundary before porting runtime internals.

### OpenClaw

Old repo obligations:

- OpenClaw package metadata and extension entrypoint.
- Bun typecheck/build workflow.
- Native manifest with config schema.
- Commands, hooks, tools, skills, update check, and runtime tests.

Integrated target:

- Keep native manifest and MCP config under `clients/openclaw`.
- Preserve the native OpenClaw extension package path before adding MCP-only
  fallback behavior; the package entrypoint now points at `./dist/index.js`.
- Keep `clients/openclaw/native-artifacts.json` as the OpenClaw native artifact
  snapshot until old hooks, commands, tools, config helpers, update checks, or
  runtime tests are accepted for migration.
- Decide the native auth model before porting config schema fields.
- Port hook/tool behavior only when it can call the shared connector core
  without exposing Membase internals.

## Next Review Step

Use `docs/review-summary.md` as the Linear-ready entry point, then decide the
remaining runtime-parity questions in `docs/runtime-parity-decisions.md` before
any publication, marketplace, GitHub, Linear, or old-repo mutation work.
