# OSS Research Targets

Use these projects as reference material before locking architecture.

## Plugin-first repos

- `obra/superpowers`
- `PostHog/ai-plugin`
- `upstash/context7`

## Source plus plugin mixed repos

- `supabase/supabase`
- `supermemoryai/supermemory`

## Existing Membase client repos

- `aristoapp/claude-membase`
- `aristoapp/hermes-membase`
- `aristoapp/openclaw-membase`
- `aristoapp/cursor-membase`

## Evaluation and compatibility references

- `modelcontextprotocol/inspector`
- `modelcontextprotocol/registry`
- `lastmile-ai/mcp-eval`
- `mclenhard/mcp-evals`
- `eval-sys/mcpmark`

## Research Questions

1. How do mature repos separate shared core from client-specific adapters?
2. How do plugin repos represent manifests, MCP config, hooks, and install docs?
3. How do they handle secrets and local endpoint configuration?
4. What can be smoke-tested without exposing internal service implementation?
5. Which marketplace or registry metadata should exist at launch?

## 2026-06-28 Evidence Snapshot

Primary GitHub sources checked during the first scheduled loop:

- `obra/superpowers`: root contains multiple plugin metadata directories,
  including `.claude-plugin`, `.codex-plugin`, and `.cursor-plugin`. Its Claude
  plugin metadata is compact JSON focused on name, description, version,
  author, repository, license, and keywords.
- `PostHog/ai-plugin`: root contains `.claude-plugin`, `.codex-plugin`,
  `.cursor-plugin`, `.mcp.json`, `hooks`, `commands`, `skills`, and `tests`,
  which supports a single repo with shared plugin assets plus client surfaces.
- `upstash/context7`: root contains `.claude-plugin` marketplace metadata and
  separate runtime/docs directories, supporting a public connector boundary
  that does not expose service internals in marketplace metadata.
- `modelcontextprotocol/inspector`: root includes `.mcp.json`; the fetched
  example uses an `mcpServers` object with explicit server type and URL.
- `modelcontextprotocol/registry`: root separates implementation areas such as
  `cmd`, `internal`, and `pkg` from `data`, `docs`, `tests`, and `tools`.
- `lastmile-ai/mcp-eval`: root contains `benchmarks`, `docs`, `examples`,
  `schema`, `scripts`, `src`, and `tests`.
- `mclenhard/mcp-evals`: root contains `src`, `__tests__`, an example server,
  and observability examples.

Implication for this repo: keep client metadata and install docs visible, keep
shared behavior in packages, and test public MCP/connector contracts without
documenting Membase's private memory implementation.

## 2026-06-28 Workspace Scaffold Evidence

- `upstash/context7` root `package.json` uses a private monorepo with
  `packages/*` workspaces and `pnpm -r` scripts for build, typecheck, and test:
  https://github.com/upstash/context7/blob/master/package.json
- `PostHog/ai-plugin` root `.mcp.json` keeps MCP client configuration as a small
  `mcpServers` document, separate from runtime implementation details:
  https://github.com/PostHog/ai-plugin/blob/main/.mcp.json

Implication for this run: add a minimal pnpm workspace, TypeScript package
checks, and shared MCP config document generation before filling in
client-specific adapters.

## 2026-06-28 Claude Adapter Evidence

- `PostHog/ai-plugin` keeps Claude plugin metadata in
  `.claude-plugin/plugin.json` with a compact package-style shape:
  https://github.com/PostHog/ai-plugin/blob/main/.claude-plugin/plugin.json
- `obra/superpowers` keeps `.claude-plugin/plugin.json` and marketplace metadata
  separate:
  https://github.com/obra/superpowers/tree/main/.claude-plugin
- `upstash/context7` uses `.claude-plugin/marketplace.json` to point at a
  plugin source directory:
  https://github.com/upstash/context7/blob/master/.claude-plugin/marketplace.json
- `PostHog/ai-plugin` keeps MCP client config as a small `mcpServers` document:
  https://github.com/PostHog/ai-plugin/blob/main/.mcp.json

Implication for this run: keep the Claude metadata compact, put client-specific
logic under `clients/claude`, and keep MCP config generation in the shared core.

## 2026-06-28 Cursor Adapter Evidence

- `PostHog/ai-plugin` keeps Cursor plugin metadata in
  `.cursor-plugin/plugin.json` with `name`, `displayName`, `version`,
  `description`, `author`, `license`, `keywords`, and `logo`:
  https://github.com/PostHog/ai-plugin/blob/main/.cursor-plugin/plugin.json
- `obra/superpowers` uses `.cursor-plugin/plugin.json` and points at
  client-specific hooks/skills from the manifest:
  https://github.com/obra/superpowers/blob/main/.cursor-plugin/plugin.json
- Cursor's current MCP docs describe `.cursor/mcp.json`,
  `~/.cursor/mcp.json`, stdio `type`, and `${env:NAME}` interpolation:
  https://cursor.com/docs/mcp.md
- Cursor's plugin docs describe `.cursor-plugin/plugin.json`, plugin-local
  `mcp.json`, local testing under `~/.cursor/plugins/local`, and marketplace
  publication:
  https://cursor.com/docs/plugins.md
- Existing `aristoapp/cursor-membase` uses a Cursor plugin manifest plus a root
  `mcp.json`, but its public README discusses implementation details that this
  integrated repo should keep out of connector APIs and launch docs:
  https://github.com/aristoapp/cursor-membase

Implication for this run: add a Cursor adapter package, keep Cursor metadata
compact, and keep the public connector copy focused on capabilities rather than
private internals. Later runtime parity evidence corrected the generated MCP
config from local stdio to the old repo's HTTP MCP-first path.

## 2026-06-28 Cursor Runtime Parity Evidence

- Existing `aristoapp/cursor-membase` root `mcp.json` points Cursor at the
  remote HTTP MCP endpoint `https://mcp.membase.so/mcp` with an empty headers
  object:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/mcp.json
- Existing Cursor plugin metadata records the old plugin shape and references
  a logo asset, but its description includes implementation-specific memory
  claims that should not be copied verbatim into this integrated repo:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/.cursor-plugin/plugin.json
- Existing Cursor repo contents include `rules/membase.mdc`, four skill
  directories, logo, README, and changelog artifacts; no old GitHub workflow
  directory was found through the GitHub contents API:
  https://github.com/aristoapp/cursor-membase

Implication for this run: preserve Cursor HTTP MCP as the primary generated MCP
config and add a non-publishing transport parity guard before porting rules,
skills, logo, or changelog text. Add local stdio only as an explicit secondary
fallback after review.

## 2026-06-28 Hermes Adapter Evidence

- Existing `aristoapp/hermes-membase` is a Python package-style Hermes plugin
  repo with `pyproject.toml`, package source under `src/membase_hermes`, tests,
  and a native plugin manifest at `src/membase_hermes/plugin/plugin.yaml`:
  https://github.com/aristoapp/hermes-membase
- The existing native Hermes manifest uses a compact YAML shape with `name`,
  `version`, `description`, and `pip_dependencies`:
  https://github.com/aristoapp/hermes-membase/blob/main/src/membase_hermes/plugin/plugin.yaml
- Hermes Agent's MCP guide configures servers under `mcp_servers` with
  `command`, `args`, optional `env`, and optional tool filtering:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md
- Hermes Agent also keeps approved optional MCP catalog entries as
  `optional-mcps/*/manifest.yaml`, which supports keeping Hermes-specific
  metadata separate from a generic MCP server config:
  https://github.com/NousResearch/hermes-agent/blob/main/optional-mcps/linear/manifest.yaml

Implication for this run: keep the Hermes adapter as a TypeScript boundary in
this integrated repo, preserve a reviewable native `plugin.yaml` placeholder,
and provide a shared MCP config example that can be translated into Hermes
`mcp_servers` YAML without exposing private Membase internals.

## 2026-06-28 OpenClaw Adapter Evidence

- Existing `aristoapp/openclaw-membase` is a TypeScript OpenClaw plugin repo
  with root `index.ts`, `openclaw.plugin.json`, package metadata, skills, hooks,
  tools, commands, and tests:
  https://github.com/aristoapp/openclaw-membase
- The existing OpenClaw manifest uses `id`, `kind`, `skills`, `uiHints`, and a
  strict `configSchema`:
  https://github.com/aristoapp/openclaw-membase/blob/main/openclaw.plugin.json
- The existing package metadata declares OpenClaw runtime extension entrypoints
  under an `openclaw.extensions` package field and keeps plugin manifest files
  in the published package:
  https://github.com/aristoapp/openclaw-membase/blob/main/package.json
- OpenClaw plugin docs describe install sources, plugin enablement under
  `plugins.entries.<id>.config`, gateway restart, and runtime verification with
  `openclaw plugins inspect <plugin-id> --runtime --json`:
  https://docs.openclaw.ai/plugins
- OpenClaw manifest docs describe `id`, `kind`, `skills`, `uiHints`, and
  strict `configSchema` as plugin control-plane metadata:
  https://docs.openclaw.ai/plugins/manifest

Implication for this run: add OpenClaw as a TypeScript adapter boundary in this
integrated repo, preserve a reviewable `openclaw.plugin.json` shape, keep local
MCP config generation in shared core, and defer runtime hook/tool parity to the
existing-repo migration checklist.

## 2026-06-28 Existing Repo Migration Evidence

- `aristoapp/claude-membase` contains a TypeScript/Bun Claude plugin with
  marketplace metadata, plugin-local MCP config, commands, hooks, skills,
  source modules, tests, and manifest validation scripts:
  https://github.com/aristoapp/claude-membase
- `aristoapp/cursor-membase` contains Cursor plugin metadata, an MCP config,
  rules, skills, logo asset, and changelog:
  https://github.com/aristoapp/cursor-membase
- `aristoapp/hermes-membase` contains a Python provider package with CLI
  entrypoints, installer/provider/capture modules, tests, and native plugin
  YAML:
  https://github.com/aristoapp/hermes-membase
- `aristoapp/openclaw-membase` contains a TypeScript OpenClaw plugin with
  package extension metadata, native manifest, config, hooks, commands, tools,
  skills, and tests:
  https://github.com/aristoapp/openclaw-membase

Implication for this run: document migration parity before porting runtime
behavior, keep implementation-specific public copy out of the integrated
connector API, and add generated-artifact checks before deeper runtime parity.

## 2026-06-28 Test Coverage Migration Evidence

- `aristoapp/claude-membase` has Bun tests for config, formatting, hooks,
  OAuth, plugin runtime wiring, profile safety, project config, sanitization,
  session-start context, spool behavior, update checks, and wiki client
  payloads. Its package metadata also defines manifest and Claude plugin
  validation scripts.
- `aristoapp/cursor-membase` has no obvious test files in the repo tree search,
  but it does have Cursor plugin metadata, MCP config, rules, skills, logo,
  README, and changelog artifacts that need snapshot or review checks if
  migrated.
- `aristoapp/hermes-membase` has pytest coverage for plugin CLI behavior,
  provider capture buffering/flushing, provider tool schemas, truncation,
  project/source fields, wiki flows, sensitive-content rejection, and prefetch
  budget behavior.
- `aristoapp/openclaw-membase` has source-level tests for tool schemas, profile
  paths, CLI commands, wiki client payloads, auto capture, formatters, star
  prompts, and update footer/version behavior.

Implication for this run: old tests should be routed into shared public-contract
coverage only when they validate connector-level behavior. Host runtime tests
should stay client-native until the corresponding old command, hook, provider,
tool, skill, rule, or package path is explicitly migrated.

## 2026-06-28 Claude And Cursor Install Evidence

- Claude Code plugin docs describe `.claude-plugin/plugin.json` as plugin
  metadata and keep commands, skills, hooks, and MCP config at the plugin root
  rather than inside `.claude-plugin/`:
  https://docs.anthropic.com/en/docs/claude-code/plugins
- Claude Code MCP docs describe `mcpServers`, `.mcp.json`,
  `claude mcp add-json`, local/project/user scopes, and environment-variable
  expansion for MCP config:
  https://docs.anthropic.com/en/docs/claude-code/mcp
- Cursor MCP docs describe project config at `.cursor/mcp.json`, global config
  at `~/.cursor/mcp.json`, stdio command servers, and `${env:NAME}` environment
  interpolation:
  https://cursor.com/docs/mcp
- Cursor plugin docs describe `.cursor-plugin/plugin.json`, plugin-local
  `mcp.json`, local plugin testing, and marketplace publication:
  https://cursor.com/docs/plugins
- `PostHog/ai-plugin` continues to be a useful compact reference for
  `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and `.mcp.json`
  metadata kept separate from runtime implementation:
  https://github.com/PostHog/ai-plugin

Implication for this run: make Claude and Cursor install docs explicit about
config placement, secret references, local smoke verification, and plugin-root
metadata boundaries. Do not add marketplace assets until the dedicated
marketplace asset pass; broken relative asset references should fail generated
artifact verification.

## 2026-06-28 Claude Runtime Parity Evidence

- `aristoapp/claude-membase` keeps plugin-local MCP config at
  `plugin/.mcp.json` and launches the runtime through
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs` with
  `MEMBASE_CLAUDE_PLUGIN=1`:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.mcp.json

Implication for this run: preserve the Claude plugin-local stdio command in
generated MCP config and keep the shared Membase API key as an environment
reference. Do not replace it with a generic `@membase/mcp-server` package unless
that runtime is explicitly accepted later.

## 2026-06-28 Hermes And OpenClaw Install Evidence

- Hermes Agent's MCP guide describes `mcp_servers` entries with `command`,
  `args`, `env`, and optional tool filters:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md
- Hermes optional MCP catalog entries keep host-specific metadata as YAML
  manifests separate from server launch configuration:
  https://github.com/NousResearch/hermes-agent/blob/main/optional-mcps/linear/manifest.yaml
- OpenClaw plugin docs describe plugin install, enablement through
  `plugins.entries.<id>.config`, gateway restart, and runtime inspection:
  https://docs.openclaw.ai/plugins
- OpenClaw manifest docs describe `id`, `kind`, `skills`, `uiHints`, and
  strict `configSchema` as plugin metadata:
  https://docs.openclaw.ai/plugins/manifest

Implication for this run: make Hermes and OpenClaw install docs explicit about
native metadata placement, MCP config translation, secret references, generated
artifact checks, and local smoke verification. Keep host manifests and shared
MCP config examples separate so publication decisions do not leak private
Membase internals.

## 2026-06-28 Deprecation Planning Evidence

- GitHub's archive documentation says archived repositories become read-only
  and recommends closing issues/pull requests, updating the README, and updating
  the repository description before archiving:
  https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories
- `aristoapp/claude-membase` is still a public Claude Code plugin repo with
  package/plugin metadata and a small existing star count:
  https://github.com/aristoapp/claude-membase
- `aristoapp/cursor-membase` is still a public Cursor plugin repo with plugin
  metadata, MCP config, rules, skills, and a logo asset:
  https://github.com/aristoapp/cursor-membase
- `aristoapp/hermes-membase` is still a public Hermes plugin repo using a
  Python package/provider shape:
  https://github.com/aristoapp/hermes-membase
- `aristoapp/openclaw-membase` is still a public OpenClaw plugin repo with the
  largest old-repo star count and native extension/plugin metadata:
  https://github.com/aristoapp/openclaw-membase

Implication for this run: deprecation should be staged as README notice PRs,
compatibility handoffs, and then archive requests. The old repos should point
new installs and stars to the integrated repo without deleting migration
history or copying private implementation claims into public launch copy.

## 2026-06-28 Marketplace Asset Evidence

- `aristoapp/claude-membase` has a root `.claude-plugin/marketplace.json` that
  points at a plugin source directory and records owner, homepage, repository,
  license, and keywords:
  https://github.com/aristoapp/claude-membase/blob/main/.claude-plugin/marketplace.json
- `aristoapp/cursor-membase` has `.cursor-plugin/plugin.json` and a relative
  `assets/logo.svg` reference:
  https://github.com/aristoapp/cursor-membase/blob/main/.cursor-plugin/plugin.json
- `aristoapp/hermes-membase` has a reusable review candidate banner asset plus
  native Hermes plugin YAML:
  https://github.com/aristoapp/hermes-membase
- `aristoapp/openclaw-membase` has native OpenClaw manifest metadata but no
  obvious image asset in the repo tree:
  https://github.com/aristoapp/openclaw-membase/blob/main/openclaw.plugin.json
- `PostHog/ai-plugin` and `obra/superpowers` remain useful references for
  keeping marketplace/plugin metadata compact and separate from runtime
  implementation:
  https://github.com/PostHog/ai-plugin
  https://github.com/obra/superpowers/tree/main/.claude-plugin

Implication for this run: add a marketplace asset checklist instead of porting
assets prematurely. Old Cursor and Hermes image assets are candidates, not
current manifest references. Public copy should be rewritten around connector
capabilities and verified with generated-artifact, smoke, secret-hygiene, and
public-surface checks before any submission review.

## 2026-06-29 Cursor Native Artifact Snapshot Evidence

- Rechecked the `aristoapp/cursor-membase` recursive tree at
  `177d29c78b2f4698ead9d5108eedeae5b6b059b7`; it contains
  `.cursor-plugin/plugin.json`, `mcp.json`, `rules/membase.mdc`, four
  `skills/*/SKILL.md` files, `assets/logo.svg`, and `CHANGELOG.md`:
  https://api.github.com/repos/aristoapp/cursor-membase/git/trees/main?recursive=1
- Rechecked old Cursor plugin metadata; it references `assets/logo.svg` and
  includes implementation-specific copy that should not be copied directly into
  generated integrated manifests:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/.cursor-plugin/plugin.json
- Rechecked old Cursor MCP config; it still points at
  `https://mcp.membase.so/mcp`:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/mcp.json
- Rechecked old Cursor changelog; it records the zero-dependency remote HTTP
  MCP shift and the rules/skills rewrite history:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/CHANGELOG.md

Implication for this run: add `clients/cursor/native-artifacts.json` as a
review-only path/SHA snapshot and guard it with `pnpm cursor:native-artifacts`.
Do not copy Cursor rules, skills, logo, or changelog content until the copy is
rewritten to the public connector-capability boundary and asset reuse is
approved.

## 2026-06-29 Claude Native Artifact Snapshot Evidence

- Rechecked the `aristoapp/claude-membase` recursive tree at
  `51c15ab3e05bd4f82847c98dd70f926f9eae4459`; it contains
  plugin metadata, plugin-local MCP config, `plugin/commands/*`,
  `plugin/hooks/hooks.json`, `plugin/skills/*/SKILL.md`,
  `plugin/agents/membase-curator.md`, bundled runtime scripts, and
  `src/hooks/session-start.ts`:
  https://api.github.com/repos/aristoapp/claude-membase/git/trees/main?recursive=1
- Rechecked old Claude plugin metadata and MCP config as the represented
  metadata/runtime-path baseline:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.claude-plugin/plugin.json
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.mcp.json
- Rechecked old Claude package/workflow evidence for the local non-publishing
  check boundary:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/package.json
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/.github/workflows/check.yml

Implication for this run: add `clients/claude/native-artifacts.json` as a
review-only path/SHA snapshot and guard it with `pnpm claude:native-artifacts`.
Do not copy Claude commands, hooks, skills, agents, or bundled runtime scripts
until each behavior is accepted and rewritten to the public
connector-capability boundary.

## 2026-06-29 OpenClaw Native Artifact Snapshot Evidence

- Rechecked the `aristoapp/openclaw-membase` recursive tree at
  `b5e2838cd053ab833426aaaf03b47a8b9921ad25`; it contains package metadata,
  `.github/workflows/check.yml`, `openclaw.plugin.json`, `src/commands/cli.ts`,
  hook sources, tool sources, config helpers, update-check behavior, and
  runtime test files:
  https://api.github.com/repos/aristoapp/openclaw-membase/git/trees/main?recursive=1
- Rechecked old OpenClaw package metadata and workflow evidence for the local
  non-publishing check boundary:
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/package.json
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/.github/workflows/check.yml
- Rechecked old OpenClaw native manifest metadata as the represented
  control-plane baseline:
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/openclaw.plugin.json

Implication for this run: add `clients/openclaw/native-artifacts.json` as a
review-only path/SHA snapshot and guard it with
`pnpm openclaw:native-artifacts`. Do not copy OpenClaw commands, hooks, tools,
config helpers, update checks, or runtime tests until each behavior is accepted
and rewritten to the public connector-capability boundary.

## 2026-06-29 Hermes Native Artifact Snapshot Evidence

- Rechecked the `aristoapp/hermes-membase` recursive tree at
  `70d5d8951cf417dce0cebf159abaae330defde96`; it contains Python package
  metadata, publish workflows, native plugin YAML, provider/register files,
  capture/config/client/OAuth/wiki/formatting/update modules, banner asset, and
  pytest files:
  https://api.github.com/repos/aristoapp/hermes-membase/git/trees/main?recursive=1
- Rechecked old Hermes package metadata and publish workflow evidence for the
  local non-publishing check boundary:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/pyproject.toml
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/.github/workflows/publish.yml

Implication for this run: add `clients/hermes/native-artifacts.json` as a
review-only path/SHA snapshot and guard it with
`pnpm hermes:native-artifacts`. Do not copy Hermes provider runtime, capture,
OAuth, wiki, formatting, banner asset, update-check, or runtime tests until
each behavior is accepted and rewritten to the public connector-capability
boundary.
