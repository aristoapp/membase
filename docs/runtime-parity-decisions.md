# Runtime Parity Decision Ledger

This document tracks the remaining runtime and launch decisions after the
scheduled Plugin/MCP integrated repo loop. It is part of the local review
surface for the Linear project `Plugin/MCP 통합 레포 출시`; it does not redefine
the project as a new product direction.

## Decision Rules

- Keep the Linear project description as the source of truth.
- Keep public connector artifacts capability-focused: remember, search, task
  context, forget, diagnostics, manifests, install config, and smoke tests.
- Do not expose Membase storage, graph, embedding, ranking, or internal memory
  engine details in public connector APIs, docs, manifests, or launch copy.
- Treat every decision below as non-mutating until Jaehwan explicitly asks for
  GitHub, Linear, marketplace, publish, merge, or old-repo changes.
- When a decision is accepted, update the impacted artifacts and rerun
  `pnpm check` and `pnpm smoke:execute`.

## Decision Ledger

| ID | Decision | Current repo assumption | Required input | Impacted artifacts | Status |
| --- | --- | --- | --- | --- | --- |
| D1 | Final public repository URL and release path | `https://github.com/aristoapp/membase-plugin-mcp` is the accepted public repo path. First review uses the repo root unless a release bundle is explicitly requested later. | Release/tag naming remains a launch-time choice. | `README.md`, `docs/marketplace-assets.md`, `docs/deprecation-plan.md`, old repo notices. | Accepted by Jaehwan. |
| D2 | Client runtime package or command path | The old repos already have distinct runtime paths: Claude plugin-local stdio, Cursor HTTP MCP, Hermes Python package, and OpenClaw native extension package. Claude generated MCP config now preserves `node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`; Cursor generated MCP config now preserves `https://mcp.membase.so/mcp`; Hermes now has an importable Python provider/register boundary; OpenClaw package metadata now preserves the native extension entrypoint at `./dist/index.js`. The current `@membase/mcp-server` example remains only a placeholder for Hermes/OpenClaw MCP fallback examples and returned npm 404 on 2026-06-28. | Preserve the remaining old packaging paths in generated configs and checks before introducing any new generic MCP package. | `packages/core`, `clients/*`, `manifests/*/mcp.json`, `docs/install/*.md`, `smoke/*`, GitHub Actions. | Finalized to `membase.so` with no user-supplied API key: Claude plugin-local stdio (`node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`), and Cursor/Hermes/OpenClaw use the remote HTTP MCP endpoint `https://mcp.membase.so/mcp`. Hermes native pip package and OpenClaw native extension remain the primary runtimes; live API behavior pending. |
| D3 | Per-client transport precedence | Transport is client-specific: Claude plugin-local stdio and Cursor HTTP MCP are primary; Hermes Python/native provider loading is now represented by a local provider/register scaffold, but live API behavior remains pending; OpenClaw native extension entrypoint is now preserved before any MCP-only fallback. | Confirm whether any client also gets a secondary fallback path, such as local stdio for Cursor or generic MCP for Hermes/OpenClaw. | `clients/*`, `manifests/*`, `docs/install/*.md`, marketplace copy, smoke tests. | Finalized: Claude plugin-local stdio and Cursor/Hermes/OpenClaw remote HTTP MCP (`https://mcp.membase.so/mcp`) with OAuth / plugin-managed auth and no user-supplied API key. Native pip/extension paths stay primary for Hermes/OpenClaw; the HTTP MCP config is the connector example. |
| D4 | Client-native runtime parity scope | Adapter skeletons cover manifests/config and smoke command declarations; old client command, hook, provider, rule, skill, and tool behavior is not silently ported. Packaging/action evidence is mapped in `docs/packaging-action-parity.md`; Claude now has a local plugin validation gate plus a native artifact snapshot at `clients/claude/native-artifacts.json`, Cursor has an HTTP transport parity gate plus a native artifact snapshot gate, Hermes has a Python package/provider boundary review gate plus a Hermes native artifact snapshot at `clients/hermes/native-artifacts.json`, and OpenClaw has a local typecheck/build parity gate plus an OpenClaw native artifact snapshot at `clients/openclaw/native-artifacts.json`. | Port client-native functionality in explicit batches after non-publishing local parity checks are added. | `clients/*`, `docs/migration-parity.md`, `docs/test-coverage-parity.md`, `docs/packaging-action-parity.md`, future client-native tests. | DONE (consolidation Groups B + C, 2026-07-04): all four client-native runtimes are copied in as-is — Hermes Python runtime at `clients/hermes/python` (provider, OAuth incl. headless client_credentials, capture, mirror, CLI, tests), OpenClaw runtime at `clients/openclaw/runtime` (client, hooks, tools, commands, manifest, tests), Claude runtime at `clients/claude/runtime` (commands, hooks, skills, agent, bundled stdio MCP server, source, tests), and Cursor artifacts under `clients/cursor` (rules, skills, logo, changelog). Native-artifact guards now assert presence; runtimes are typechecked and tested in CI. Dedupe into a shared core is a post-launch refactor. |
| D5 | Marketplace asset reuse | Asset reuse guidance belongs in each `clients/*/README.md`; generated manifests should still avoid asset references until files are committed and checked. | Confirm asset ownership/design before copying old files. | `clients/*/README.md`, `docs/marketplace-assets.md`, `clients/*/assets`, generated manifests, committed manifest copies. | Accepted direction; the Cursor logo asset is committed at `clients/cursor/assets/logo.svg` (Group C). Referencing it from generated manifests stays a launch-time choice. |
| D6 | Live client-to-MCP smoke gate | Jaehwan approved adding the live smoke gate. As of 2026-07-05 (north-star Gate 2 sign-off, PR #13), all five clients were exercised end-to-end by a real user: Claude Code (bundled stdio round-trip), Cursor (in-app round-trip), Codex (managed OAuth + session recall), Hermes (pip install + OAuth + session recall), and OpenClaw (live Telegram gateway — search, wiki-search, wiki-write all confirmed against `clients/openclaw/runtime` loaded from this repo). | Two footnotes remain, accepted at sign-off: Hermes auto-capture was observed only via the running session worker, not isolated end-to-end; and the package-level headless `client_credentials` grant was not exercised locally (the secret lives only in GH Actions secrets) — the same grant is exercised daily by e2e Tier 2/3 CI instead. | `smoke/*`, `docs/security.md`, `docs/live-smoke-runbook.md`, `docs/install/*.md`, `docs/north-star-readiness.md`, CI or local check scripts. | DONE — live smoke passed for all five clients (north-star Gate 2, 2026-07-05); the two footnotes above are accepted, not blocking. |

## Per-Client Runtime Questions

| Client | Question before launch handoff | First safe default |
| --- | --- | --- |
| Claude Code | Should old commands, skills, agents, hooks, session-start behavior, project scoping, and manifest validation move into this repo? | Keep current adapter/config/docs plus `clients/claude/native-artifacts.json` as reviewable evidence until each behavior is accepted into the public connector contract or marked legacy. |
| Cursor | Should old rules, skills, logo, and changelog text be ported after remote MCP URL support? | Keep HTTP MCP config as the primary path; port rules, skills, or assets only after review. |
| Hermes Agent | Should the old Python provider package remain the runtime, migrate here, or be replaced by MCP-only config? | Keep native plugin metadata, provider register boundary, MCP config, and `clients/hermes/native-artifacts.json` separated until package-path ownership is decided. |
| OpenClaw | Should native hooks, commands, tools, skills, and config schema be migrated now that the extension entrypoint is preserved? | Keep native manifest placeholder, MCP config, and `clients/openclaw/native-artifacts.json` reviewable; defer hook/tool parity until auth and command/tool decisions are accepted. |

## Decision Detail

### D2: Client Runtime Package or Command Path

D2 decides what command or package each client actually runs. The important
correction is that the old repos do not all share one runtime shape, so the
integrated repo should not flatten them into a single package before parity is
understood.

Hermes and OpenClaw generated MCP fallback examples still point at the
placeholder:

```json
{
  "command": "npx",
  "args": ["-y", "@membase/mcp-server"]
}
```

That package is not currently available in the public npm registry:
`npm view @membase/mcp-server name version bin dist-tags --json` returned npm
404 on 2026-06-28. Claude generated MCP config now preserves the old
plugin-local path:

```json
{
  "command": "node",
  "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs"]
}
```

Cursor generated MCP config now preserves the old remote MCP path:

```json
{
  "url": "https://mcp.membase.so/mcp",
  "headers": {}
}
```

More importantly, the old repos already identify the runtime paths that should
be respected:

| Client | Existing runtime/package path | Action to migrate |
| --- | --- | --- |
| Claude Code | Bun/TypeScript plugin package with plugin-local `node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`. | Done for generated MCP config and Claude plugin validation checks; migrate commands/hooks/skills separately before replacing it with any generic package. |
| Cursor | `.cursor-plugin/plugin.json` plus HTTP MCP config pointing at `https://mcp.membase.so/mcp`. | Done for generated MCP config; add local stdio only as an explicit secondary option. |
| Hermes Agent | PyPI package `hermes-membase` with `hermes-membase` and `hermes-membase-install` scripts. | Provider import/register boundary is now represented locally; migrate live API behavior separately and keep publish disabled until explicitly authorized. |
| OpenClaw | npm/Bun package `@membase/openclaw-membase` with native extension entrypoint. | Done for package metadata, typecheck/build, and a built default native entrypoint export; migrate hooks/tools separately before adding MCP-only fallback behavior. |

The default recommendation is now to preserve these per-client runtime paths.
`@membase/mcp-server` should become a separate generic MCP runtime only if that
is explicitly accepted after the client-specific paths are covered.

### D3: Per-Client Transport Precedence

D3 decides transport precedence for each client. This is not a single global
choice because the old repos already show different transports.

| Client | Primary transport to preserve | Optional/follow-up transport |
| --- | --- | --- |
| Claude Code | Plugin-local stdio MCP command. | Generic MCP package only if it preserves Claude plugin behavior. |
| Cursor | HTTP MCP endpoint from old `mcp.json`. | Local stdio fallback only if Cursor install docs need offline/local mode. |
| Hermes Agent | Native Python provider/package path, with import/register boundary now present locally. | MCP-only config if Hermes review accepts it as equivalent. |
| OpenClaw | Native extension package path with `openclaw.extensions` pointing at `./dist/index.js`. | MCP-only config as a fallback after hook/tool parity is covered. |

Local stdio and HTTP transport are therefore both valid, but they should be
chosen per client based on existing behavior and host support.

### D4: Client-Native Runtime Parity Scope

D4 decides how much behavior from the four old client-specific repos moves into
this integrated repo before launch. The current repo intentionally covers the
shared connector layer first: adapter boundary, manifests/configs, install docs,
and smoke declarations.

| Client | Old behavior not yet ported | Safe first-launch stance |
| --- | --- | --- |
| Claude Code | Commands, skills, agents, hooks, session-start behavior, project scoping, status/login/logout flows, and plugin validation scripts. | Keep current adapter/config/docs plus the Claude native artifact snapshot as the integrated baseline; migrate commands/hooks/skills only after they are explicitly accepted into the public connector contract. |
| Cursor | Rules, skills, logo, and changelog text after remote MCP URL compatibility. | Keep HTTP MCP config and connector-capability copy; use `clients/cursor/native-artifacts.json` as the review-only snapshot, then port rules/skills/assets as follow-up changes only after review. |
| Hermes Agent | Python provider package, installer, provider tools, capture behavior, OAuth flow, update check, and tests. | Keep the provider register boundary and Hermes native artifact snapshot local and review-safe; migrate live tool behavior only after the package/runtime ownership decision is made. |
| OpenClaw | Hooks, commands, tools, skills, config fields, update checks, and runtime tests. | Keep native manifest placeholder, package entrypoint, MCP config, and the OpenClaw native artifact snapshot as the integrated baseline; migrate native hooks/tools only after auth and command/tool decisions are accepted. |

The next D4 step is not to port everything at once. Continue converting the
packaging/action map into local non-publishing checks, then port feature groups
with tests:

1. Packaging/action checks.
2. Runtime entrypoints.
3. Commands/tools/rules/skills.
4. Hooks/capture/session lifecycle.
5. Display formatting, update checks, and launch prompts.

## Verification Gate

Before any external launch, old repo notice, marketplace submission, or live
runtime handoff:

```bash
pnpm check
pnpm smoke:execute
pnpm smoke:live:preflight
pnpm claude:plugin-parity
pnpm cursor:transport-parity
pnpm cursor:native-artifacts
pnpm hermes:python-parity
pnpm hermes:native-artifacts
pnpm openclaw:native-artifacts
pnpm openclaw:native-parity
```

If D2 and D6 are accepted, add live client-to-MCP smoke coverage that uses
explicit test credentials, creates tagged test data, cleans it up, and prints
only redacted diagnostics. Use `docs/live-smoke-runbook.md` as the implementation
contract.

While D2 and D3 remain incomplete, `pnpm smoke:live:preflight` is the expected
non-network check. It fails if the repo starts advertising a runnable
`smoke:live` command or stops recording the remaining placeholder MCP runtime
blocker.

## No External Mutations

This ledger is a review artifact only. It does not publish packages, open pull
requests, update Linear, submit marketplace listings, archive old repositories,
or change GitHub repository state.
