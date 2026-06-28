# Test Coverage Parity Map

This document tracks the `MEM-330` test migration step for the integrated
Plugin/MCP repo. It maps old client repo coverage into the verification model
for this repo without copying private Membase implementation details into the
public connector surface.

## Scope

Use this file to decide whether old coverage belongs in:

- shared connector-contract tests for `packages/core`, `packages/connector-sdk`,
  and `smoke/`
- client-native parity tests under `clients/{claude,cursor,hermes,openclaw}`
- launch or marketplace validation checks
- deferred runtime work that needs a separate migration decision

Do not use this file to expand the public connector API beyond the Linear
project scope. The public contract remains remember, search, task context,
forget, diagnostics, manifests, install config, and smoke tests.

## Evidence Snapshot

Checked on 2026-06-28 using GitHub API tree reads, raw package metadata, and
raw test declaration sampling.

| Source repo | Test and check evidence |
| --- | --- |
| `aristoapp/claude-membase` | `package.json` defines `bun test`, `manifest:check`, Claude plugin validation, typecheck, lint, and format checks. Test files cover config, formatting, transcript hooks, OAuth browser launch, plugin runtime wiring, profile safety, project config, sanitization, session-start context, local spool behavior, update checks, and wiki client payloads. |
| `aristoapp/cursor-membase` | No obvious test files matched the repo tree search. The repo contains `.cursor-plugin/plugin.json`, `mcp.json`, rules, skills, logo asset, README, and changelog artifacts that need snapshot or review checks if migrated. |
| `aristoapp/hermes-membase` | `pyproject.toml` defines a Python package with `ruff` and `mypy` config. Pytest files cover plugin CLI argv/exit behavior, provider capture buffering and flushing, provider tool schemas, truncation, project/source fields, wiki flows, sensitive-content rejection, and prefetch budget behavior. |
| `aristoapp/openclaw-membase` | `package.json` defines build, lint, and typecheck scripts. Source test files cover tool schemas, profile paths, CLI commands, wiki client payloads, auto capture, formatters, current date helper, GitHub star prompt behavior, and update footer/version behavior. |

Primary evidence links:

- https://github.com/aristoapp/claude-membase
- https://github.com/aristoapp/cursor-membase
- https://github.com/aristoapp/hermes-membase
- https://github.com/aristoapp/openclaw-membase

## Current Integrated Coverage

`pnpm check` currently verifies:

- TypeScript build for shared packages and all four client adapters.
- Generated plugin and MCP artifacts match adapter output.
- Dry-run client smoke coverage for four clients and their declared commands.
- Public remember, search, context, and forget flow through
  `smoke/public-contract-stub.mjs`.
- Secret redaction and secret-hygiene scanning for committed connector
  artifacts.
- Public-surface wording guard against private Membase implementation details.

`pnpm smoke:execute` additionally executes adapter-declared local smoke
commands. Live client-to-MCP runtime checks remain pending until the shared MCP
server package path or equivalent local command is available.

## Routing Rules

Shared connector-contract tests should cover behavior that every client must
preserve:

- endpoint, auth env, profile, timeout, and client identity validation
- generated MCP config shape and secret reference handling
- redacted diagnostics
- public remember, search, task context, and forget behavior
- public error and cleanup behavior for smoke tests

Client-native parity tests should cover behavior that only exists because of a
client host:

- Claude commands, hooks, skills, plugin validation, and session-start behavior
- Cursor rules, skills, plugin metadata, and config placement
- Hermes Python package, provider, installer, CLI, and native YAML behavior
- OpenClaw native extension, hooks, tools, commands, skills, and manifest
  behavior

Deferred or excluded coverage:

- private storage schema, graph structure, embedding or chunking behavior,
  ranking/freshness implementation, and internal governance behavior
- user-specific config, tokens, local profile data, or production API calls
- old launch copy that describes implementation internals instead of connector
  capabilities

## Coverage Mapping

| Old coverage area | Old evidence | Integrated target | Current status |
| --- | --- | --- | --- |
| Manifest and MCP config validation | Claude `manifest:check` and plugin validation, Cursor plugin/MCP artifacts, Hermes plugin YAML, OpenClaw native manifest | `scripts/check-generated-artifacts.mjs` plus future client-native validators where host CLIs are available | Partial. Generated artifact drift is covered; host CLI validation is still pending. |
| Auth, endpoint, and profile safety | Claude config/profile/OAuth tests, Hermes CLI config tests, OpenClaw profile path tests | Shared core unit tests plus smoke coverage for env references and redaction | Partial. Smoke covers safe references; focused core unit tests are still pending. |
| Public memory contract | Claude recall/remember/project/wiki-adjacent tests, Hermes provider tool tests, OpenClaw tool schema tests | `smoke/public-contract-stub.mjs` and future contract fixtures for public operations only | Partial. Core remember/search/context/forget is covered; richer result formatting fixtures are pending. |
| Secret and content safety | Claude sanitize tests, Hermes sensitive-content rejection test, current repo secret-hygiene scan | `scripts/check-secret-hygiene.mjs`, `scripts/check-public-surface.sh`, and future unit fixtures for client payload filtering | Partial. Static guards exist; client-specific sensitive payload behavior is still pending. |
| Formatting and truncation | Claude format/wiki formatting, Hermes preview truncation, OpenClaw formatters | Shared public formatting fixtures if the integrated repo owns display output; otherwise client-native parity tests | Pending. No display formatting fixture exists yet. |
| Hooks, capture, and session lifecycle | Claude transcript/session/spool tests, Hermes capture buffering/flushing tests, OpenClaw auto-capture tests | Client-native parity tests with a stubbed public connector client | Pending. Runtime hook/provider migration decisions are still required. |
| Commands, tools, and schemas | Claude plugin runtime tests, Hermes provider tool schema tests, OpenClaw CLI/tool schema tests | Adapter smoke commands now; deeper client-native schema tests after commands/tools are migrated | Partial. Command existence is covered; host-specific schema behavior is pending. |
| Update checks and launch prompts | Claude update-check tests, OpenClaw update/star prompt tests | Launch/deprecation decision. Add only if the integrated repo keeps these behaviors | Deferred. Not required for the current public connector contract. |
| Cursor rules and skills | Cursor repo has rules, skills, logo, changelog, plugin metadata, and MCP config but no obvious tests | Snapshot/review checks if rules or skills are ported into this repo | Pending. Cursor artifacts exist, but rules/skills migration is not started. |
| Wiki and project flows | Claude wiki/project tests, Hermes wiki tool tests, OpenClaw wiki client tests | Needs product-scope decision before becoming public connector tests | Pending. Keep out of shared contract tests until scope is explicit. |

## Next Test Work

1. Add focused `packages/core` unit coverage for config validation, env
   reference generation, and diagnostic redaction after a repo test runner is
   selected.
2. Add client-native parity fixtures only after each old command, hook, skill,
   provider, or tool is explicitly accepted into the integrated repo.
3. Add host CLI validation checks for Claude, Cursor, Hermes, and OpenClaw only
   when the check can run locally without publishing, installing globally, or
   using production secrets.
4. Keep `smoke/public-contract-stub.mjs` as the shared contract boundary until
   the live MCP server package path is available.
