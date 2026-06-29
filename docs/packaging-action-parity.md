# Packaging and Action Parity Map

This document tracks the post-20 runtime parity step for the integrated
Plugin/MCP repo. It records the old client repo packaging and GitHub Action
shape before any publish, marketplace, old-repo, GitHub, or Linear mutation is
enabled.

Scope:

- Preserve the Linear project `Plugin/MCP 통합 레포 출시` as source of truth.
- Move only non-publishing checks into this repo first.
- Keep publish workflows documented but disabled until Jaehwan explicitly asks
  for publishing work.
- Keep public artifacts capability-focused and do not expose private Membase
  memory internals.

## Evidence Snapshot

Checked on 2026-06-28 from the public GitHub sources below.

| Client | Source evidence | Old packaging/action shape | Integrated parity target |
| --- | --- | --- | --- |
| Claude Code | `aristoapp/claude-membase` root `package.json`, `.github/workflows/check.yml`, `plugin/.claude-plugin/plugin.json`, `plugin/.mcp.json`, and the recursive repo tree for commands, hooks, skills, agent, bundled runtime scripts, and session-start evidence. | Bun package. `bun run check` chains build, format, lint, typecheck, tests, and manifest validation. The workflow also installs Claude Code and runs `bun run validate:plugin` plus `bun run validate:marketplace`. The plugin bundle contains native Claude commands, hooks, skills, an agent, and runtime scripts that should not be copied before review. | `pnpm claude:plugin-parity` now validates the integrated Claude plugin metadata with the local Claude Code CLI, checks manifest/version/MCP secret-reference drift without marketplace submission, and preserves the plugin-local stdio config shape. `pnpm claude:native-artifacts` guards `clients/claude/native-artifacts.json` as the review-only snapshot for old native artifacts before any behavior is ported. |
| Cursor | `aristoapp/cursor-membase` `mcp.json`, `.cursor-plugin/plugin.json`, and missing `.github/workflows` directory | No old GitHub workflow was found. The old package shape is metadata plus remote MCP config at `https://mcp.membase.so/mcp`, `rules/membase.mdc`, skills, logo, README, and changelog artifacts. | `pnpm cursor:transport-parity` now preserves HTTP MCP as the first-class Cursor transport. `pnpm cursor:native-artifacts` guards the review-only snapshot in `clients/cursor/native-artifacts.json` for rules, skills, logo, and changelog evidence before any copy is ported. |
| Hermes Agent | `aristoapp/hermes-membase` `pyproject.toml`, `src/membase_hermes/provider.py`, `src/membase_hermes/plugin/__init__.py`, `.github/workflows/publish.yml`, and the recursive repo tree for `src/membase_hermes/capture.py`, OAuth, wiki, formatting, asset, update-check, and test evidence. | Python package with `hermes-membase` and `hermes-membase-install` console scripts, a native provider class, plugin register shim, and tag-based publish workflow: install build tooling, run `python -m build`, then `twine upload` with a PyPI token. The package also contains capture buffering, OAuth, wiki/project helpers, display formatting, update checks, banner asset, and pytest coverage that should not be copied before review. | `pnpm hermes:python-parity` now validates the local Python package review scaffold, console script entrypoints, native YAML package data, Python syntax, provider import/register behavior, and non-publishing boundary. `pnpm hermes:native-artifacts` guards `clients/hermes/native-artifacts.json` as the review-only snapshot for old native artifacts before any behavior is ported. Keep live API calls and PyPI upload disabled until explicitly authorized. |
| OpenClaw | `aristoapp/openclaw-membase` root `package.json`, `.github/workflows/check.yml`, `openclaw.plugin.json`, and the recursive repo tree for `src/commands/cli.ts`, hooks, tools, config helpers, update checks, and runtime tests. | Bun/npm package with native OpenClaw extension entrypoint. The workflow installs with Bun, runs `bun run check-types`, and runs `bun run build`. The package also contains native commands, hooks, tools, config helpers, update checks, and tests that should not be copied before review. | `pnpm openclaw:native-parity` now runs the integrated OpenClaw typecheck/build path, verifies `openclaw.extensions` points at `./dist/index.js`, imports the built native entrypoint, and keeps the manifest/package private and non-publishing. `pnpm openclaw:native-artifacts` guards `clients/openclaw/native-artifacts.json` as the review-only snapshot for old native artifacts before any behavior is ported. |

Primary source links:

- https://raw.githubusercontent.com/aristoapp/claude-membase/main/package.json
- https://raw.githubusercontent.com/aristoapp/claude-membase/main/.github/workflows/check.yml
- https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.claude-plugin/plugin.json
- https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.mcp.json
- https://api.github.com/repos/aristoapp/claude-membase/git/trees/main?recursive=1
- https://raw.githubusercontent.com/aristoapp/cursor-membase/main/mcp.json
- https://github.com/aristoapp/cursor-membase/tree/main/.cursor-plugin
- https://api.github.com/repos/aristoapp/cursor-membase/git/trees/main?recursive=1
- https://raw.githubusercontent.com/aristoapp/hermes-membase/main/pyproject.toml
- https://raw.githubusercontent.com/aristoapp/hermes-membase/main/.github/workflows/publish.yml
- https://api.github.com/repos/aristoapp/hermes-membase/git/trees/main?recursive=1
- https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/package.json
- https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/.github/workflows/check.yml
- https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/openclaw.plugin.json
- https://api.github.com/repos/aristoapp/openclaw-membase/git/trees/main?recursive=1

## Local Parity Rules

1. Non-publishing checks may be added to `pnpm check` when they run locally
   without secrets, global installs, marketplace submission, or production API
   calls.
2. Publishing steps remain documentation-only until explicitly authorized.
   This includes PyPI upload, npm publish, marketplace submission, old-repo
   deprecation, and GitHub or Linear mutation.
3. Host CLI checks may be added only when their installer and runtime can be
   invoked in a deterministic local review environment.
4. Client-native package paths take precedence over the placeholder generic MCP
   package while D2 and D3 are being resolved.

## Migration Queue

| Order | Parity step | Status |
| --- | --- | --- |
| 1 | Document old packaging/action evidence for Claude, Cursor, Hermes, and OpenClaw. | Done. |
| 2 | Add this local parity-map guard to `pnpm check`. | Done. |
| 3 | Add Claude plugin validation only after the Claude Code CLI check can run locally without marketplace submission. | Done: `pnpm claude:plugin-parity` validates `clients/claude` with `claude plugin validate`, preserves plugin-local stdio config, and keeps marketplace validation deferred. |
| 3a | Add Claude command/hook/skill/agent/runtime snapshot checks before those behaviors are ported. | Done: `pnpm claude:native-artifacts` verifies `clients/claude/native-artifacts.json`, keeps old native artifacts uncopied, and keeps generated Claude metadata free of premature native-behavior declarations. |
| 4 | Preserve Cursor HTTP MCP transport before any rules, skills, or asset migration. | Done: `pnpm cursor:transport-parity` checks committed Cursor MCP examples for `https://mcp.membase.so/mcp` and rejects generic stdio placeholder regression. |
| 4a | Add Cursor metadata/rules/skills/logo/changelog snapshot checks before those assets are ported. | Done: `pnpm cursor:native-artifacts` verifies `clients/cursor/native-artifacts.json`, keeps deferred artifacts uncopied, and keeps generated Cursor metadata free of premature `logo` or `icon` references. |
| 4b | Port Cursor rules, skills, logo, or changelog copy after review. | Pending. |
| 5 | Add Hermes Python build, provider boundary, and distribution verification as non-publishing checks. | Done: `pnpm hermes:python-parity` is wired into `pnpm check` and verifies local provider import/register behavior. |
| 5a | Add Hermes provider/capture/OAuth/wiki/formatting/asset/update/test snapshot checks before those behaviors are ported. | Done: `pnpm hermes:native-artifacts` verifies `clients/hermes/native-artifacts.json`, keeps deferred runtime modules uncopied, and keeps live API behavior disabled until explicitly accepted. |
| 6 | Add OpenClaw native build/typecheck and extension entrypoint parity as non-publishing checks. | Done: `pnpm openclaw:native-parity` is wired into `pnpm check` and imports the built native entrypoint. |
| 6a | Add OpenClaw command/hook/tool/config/update/test snapshot checks before those behaviors are ported. | Done: `pnpm openclaw:native-artifacts` verifies `clients/openclaw/native-artifacts.json`, keeps old native artifacts uncopied, and keeps generated OpenClaw metadata free of premature native-behavior declarations. |
| 7 | Keep package and manifest versions synchronized before any release tag or publish path is chosen. | Done: `pnpm version-parity` verifies workspace package versions, public plugin manifest versions, Hermes Python/YAML package metadata, and MCP client-version examples. |

## Version Metadata Parity

`pnpm version-parity` keeps the current `0.0.0` review version synchronized
across npm workspace package manifests, Claude and Cursor plugin manifests,
Hermes plugin YAML and Python package metadata, and MCP
`MEMBASE_CLIENT_VERSION` examples. This is a local review guard only; it does
not decide release tags, enable package publication, or add a version field to
OpenClaw's native manifest before ownership of that field is accepted.

## Non-Mutating Boundary

The Claude native artifact snapshot records concrete old repo paths such as
`plugin/commands/login.md`, `plugin/hooks/hooks.json`,
`plugin/skills/remember/SKILL.md`, `plugin/scripts/mcp-server.cjs`, and
`src/hooks/session-start.ts` as review-only evidence. Those files remain
uncopied until a separate migration decision accepts the behavior.

The OpenClaw native artifact snapshot records concrete old repo paths such as
`src/commands/cli.ts`, `src/hooks/capture.ts`, `src/tools/search.ts`,
`src/config.ts`, `src/update-check.ts`, and `src/membase-tools.test.ts` as
review-only evidence. Those files remain uncopied until a separate migration
decision accepts the behavior.

The Hermes native artifact snapshot records concrete old repo paths such as
`src/membase_hermes/provider.py`, `src/membase_hermes/capture.py`,
`src/membase_hermes/oauth.py`, `src/membase_hermes/wiki_project.py`,
`src/membase_hermes/format.py`, `hermes-membase-banner.png`, and
`tests/test_provider_tools.py` as review-only evidence. Those files remain
uncopied until a separate migration decision accepts the behavior.

This map does not add GitHub Actions, publish packages, install marketplace
assets, update Linear, merge branches, archive old repos, or modify external
repository state. It exists so future local checks can be added in the same
order as the old repo evidence, with publishing paths kept behind explicit
approval.
