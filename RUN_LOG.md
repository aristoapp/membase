# Run Log

Manual bootstrap:

- Created the local integrated repo skeleton.
- Captured Linear project source of truth.
- Added the 20-run execution plan.

## 2026-06-28 04:32 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Researched primary GitHub references for the initial architecture decision:
  `obra/superpowers`, `PostHog/ai-plugin`, `upstash/context7`,
  `modelcontextprotocol/inspector`, `modelcontextprotocol/registry`,
  `lastmile-ai/mcp-eval`, and `mclenhard/mcp-evals`.
- Added accepted ADR `docs/adr/0001-integrated-connector-repo.md`, keeping the
  Linear project scope as source of truth and locking the public/private
  connector boundary.
- Updated `docs/architecture.md` and `docs/research/oss-targets.md` with the
  decision and evidence snapshot.
- Added `scripts/check-public-surface.sh` to guard public source/adapter
  surfaces against private Membase internals.

Verification:

- `scripts/check-public-surface.sh` passed.

Next step:

- Add package/workspace tooling or shared core config primitives for `MEM-328`
  and `MEM-329`.

## 2026-06-28 05:05 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Chose the next smallest step from `PLAN.md`: `MEM-328` package/workspace
  tooling plus the first `MEM-329` shared core config primitives.
- Added pnpm workspace scaffolding: root `package.json`, `pnpm-workspace.yaml`,
  shared TypeScript configs, package manifests, and `.gitignore`.
- Implemented `packages/core` runtime config primitives for connector identity,
  endpoint/auth env config, MCP config document generation, validation, and
  redacted environment diagnostics.
- Tightened `packages/connector-sdk` so client adapters receive the shared
  runtime config and return a concrete MCP config document.
- Updated README local check instructions, architecture implementation path, and
  OSS research notes.

Research/evidence:

- `upstash/context7` root `package.json` uses `packages/*` workspaces and
  `pnpm -r` build/typecheck/test scripts:
  https://github.com/upstash/context7/blob/master/package.json
- `PostHog/ai-plugin` root `.mcp.json` uses a compact `mcpServers` document:
  https://github.com/PostHog/ai-plugin/blob/main/.mcp.json

Verification:

- `pnpm install` completed and generated `pnpm-lock.yaml`.
- `pnpm check` passed: TypeScript build plus `scripts/check-public-surface.sh`.

Next step:

- Add the first client adapter skeleton, starting with Claude or Cursor, using
  the new SDK boundary and generated MCP config shape.

## 2026-06-28 05:35 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and added the first client adapter
  skeleton for Claude Code.
- Added `clients/claude` as a workspace TypeScript package implementing the
  SDK `ClientAdapter`, including manifest generation, MCP config generation,
  and declared local smoke commands.
- Added canonical Claude plugin and MCP config artifacts at
  `clients/claude/.claude-plugin/plugin.json`, `manifests/claude/plugin.json`,
  and `manifests/claude/mcp.json`.
- Added `docs/install/claude.md`, updated README coverage, documented client
  adapter status in `docs/architecture.md`, and extended OSS research notes.
- Added `clients/*/dist/` to `.gitignore` after TypeScript emitted client build
  output.

Research/evidence:

- `PostHog/ai-plugin` Claude plugin metadata:
  https://github.com/PostHog/ai-plugin/blob/main/.claude-plugin/plugin.json
- `obra/superpowers` Claude plugin metadata directory:
  https://github.com/obra/superpowers/tree/main/.claude-plugin
- `upstash/context7` Claude marketplace metadata:
  https://github.com/upstash/context7/blob/master/.claude-plugin/marketplace.json
- `PostHog/ai-plugin` MCP config shape:
  https://github.com/PostHog/ai-plugin/blob/main/.mcp.json

Verification:

- `pnpm install` completed and recognized 4 workspace projects.
- `pnpm check` passed: TypeScript build for core, SDK, and Claude adapter plus
  `scripts/check-public-surface.sh`.

Next step:

- Add the Cursor adapter skeleton using the same SDK boundary and generated MCP
  config shape, then start aligning Claude/Cursor install docs.

## 2026-06-28 06:05 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and added the Cursor adapter skeleton.
- Added `clients/cursor` as a workspace TypeScript package implementing the
  SDK `ClientAdapter`, including manifest generation, Cursor-compatible MCP
  config generation, and declared local smoke commands.
- Added canonical Cursor plugin and MCP config artifacts at
  `clients/cursor/.cursor-plugin/plugin.json`, `clients/cursor/mcp.json`,
  `manifests/cursor/plugin.json`, and `manifests/cursor/mcp.json`.
- Added `docs/install/cursor.md`, updated `clients/cursor/README.md`, updated
  root TypeScript references/scripts, and documented Cursor status in
  `README.md`, `docs/architecture.md`, and `docs/research/oss-targets.md`.
- Extended `packages/core` MCP config generation with optional stdio `type` and
  Cursor `${env:NAME}` environment interpolation so Cursor does not require
  adapter-local secret formatting.

Research/evidence:

- `PostHog/ai-plugin` Cursor plugin metadata:
  https://github.com/PostHog/ai-plugin/blob/main/.cursor-plugin/plugin.json
- `obra/superpowers` Cursor plugin metadata:
  https://github.com/obra/superpowers/blob/main/.cursor-plugin/plugin.json
- Cursor MCP config docs for `.cursor/mcp.json`, stdio `type`, and
  `${env:NAME}` interpolation:
  https://cursor.com/docs/mcp.md
- Cursor plugin docs for `.cursor-plugin/plugin.json`, plugin-local `mcp.json`,
  and local plugin testing:
  https://cursor.com/docs/plugins.md
- Existing `aristoapp/cursor-membase` structure check:
  https://github.com/aristoapp/cursor-membase

Verification:

- `pnpm install` completed and recognized 5 workspace projects.
- `pnpm check` passed: TypeScript build for core, SDK, Claude adapter, Cursor
  adapter, plus `scripts/check-public-surface.sh`.

Next step:

- Add the Hermes adapter skeleton using the same SDK boundary and generated MCP
  config shape, then continue keeping client docs aligned.

## 2026-06-28 06:28 UTC

- Added `docs/context.html` as a human-readable context board for Jaehwan and
  automation runs to stay synchronized on motivation, decisions, implementation
  status, verification status, open questions, and next steps.
- Linked the context board from `README.md`.
- Kept the board as internal sync documentation, not public launch copy.

Verification:

- `pnpm check` passed: TypeScript build for core, SDK, Claude adapter, Cursor
  adapter, plus `scripts/check-public-surface.sh`.

Next step:

- Continue with the Hermes adapter skeleton, and update `docs/context.html`
  whenever status or decisions change.

## 2026-06-28 06:36 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and added the Hermes Agent adapter
  skeleton.
- Added `clients/hermes` as a workspace TypeScript package implementing the
  SDK `ClientAdapter`, including native Hermes plugin manifest generation, MCP
  config generation, and declared local smoke commands.
- Added canonical Hermes artifacts at `clients/hermes/plugin/plugin.yaml`,
  `clients/hermes/mcp.json`, `manifests/hermes/plugin.yaml`, and
  `manifests/hermes/mcp.json`.
- Added `docs/install/hermes.md`, updated `clients/hermes/README.md`, updated
  root TypeScript references/scripts, and documented Hermes status in
  `README.md`, `docs/architecture.md`, `docs/research/oss-targets.md`, and
  `docs/context.html`.

Research/evidence:

- Existing `aristoapp/hermes-membase` repo structure and Python package
  manifest:
  https://github.com/aristoapp/hermes-membase
- Existing Hermes plugin metadata shape:
  https://github.com/aristoapp/hermes-membase/blob/main/src/membase_hermes/plugin/plugin.yaml
- Hermes MCP configuration guide for `mcp_servers`, `command`, `args`, `env`,
  and tool filtering:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md
- Hermes optional MCP catalog manifest example:
  https://github.com/NousResearch/hermes-agent/blob/main/optional-mcps/linear/manifest.yaml

Verification:

- `pnpm install` completed and recognized 6 workspace projects.
- `pnpm check` passed: TypeScript build for core, SDK, Claude adapter, Cursor
  adapter, Hermes adapter, plus `scripts/check-public-surface.sh`.

Next step:

- Add the OpenClaw adapter skeleton using the same SDK boundary and generated
  MCP config shape, then continue toward existing-repo migration parity.

## 2026-06-28 07:05 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and added the OpenClaw adapter
  skeleton.
- Added `clients/openclaw` as a workspace TypeScript package implementing the
  SDK `ClientAdapter`, including native OpenClaw plugin manifest generation,
  MCP config generation, and declared local smoke commands.
- Added canonical OpenClaw artifacts at `clients/openclaw/openclaw.plugin.json`,
  `clients/openclaw/mcp.json`, `manifests/openclaw/plugin.json`, and
  `manifests/openclaw/mcp.json`.
- Added `docs/install/openclaw.md`, updated `clients/openclaw/README.md`,
  updated root TypeScript references/scripts, and documented OpenClaw status in
  `README.md`, `docs/architecture.md`, `docs/research/oss-targets.md`, and
  `docs/context.html`.
- Kept the new OpenClaw public copy focused on connector capabilities and
  install/config metadata, without carrying forward private implementation
  wording from the old repo README.

Research/evidence:

- Existing `aristoapp/openclaw-membase` repo structure:
  https://github.com/aristoapp/openclaw-membase
- Existing OpenClaw manifest shape:
  https://github.com/aristoapp/openclaw-membase/blob/main/openclaw.plugin.json
- Existing OpenClaw package metadata and extension entrypoint shape:
  https://github.com/aristoapp/openclaw-membase/blob/main/package.json
- OpenClaw plugin install, enablement, config, gateway restart, and runtime
  inspect docs:
  https://docs.openclaw.ai/plugins
- OpenClaw manifest docs:
  https://docs.openclaw.ai/plugins/manifest

Verification:

- `pnpm install` completed and recognized 7 workspace projects.
- `pnpm check` passed: TypeScript build for core, SDK, Claude adapter, Cursor
  adapter, Hermes adapter, OpenClaw adapter, plus
  `scripts/check-public-surface.sh`.

Next step:

- Start the existing-repo migration inventory and parity checklist for
  `MEM-330`, covering Claude, Cursor, Hermes, and OpenClaw.

## 2026-06-28 07:34 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and started `MEM-330` migration parity
  work.
- Added `docs/migration-parity.md` with an inventory of the existing Claude,
  Cursor, Hermes, and OpenClaw repos, a shared parity checklist, and
  per-client migration gaps.
- Updated `README.md`, `docs/architecture.md`, `docs/research/oss-targets.md`,
  and `docs/context.html` to link the migration checklist and mark the current
  status.
- Kept the migration checklist at the connector-capability boundary and did
  not copy implementation-specific runtime details into public client APIs.

Research/evidence:

- Existing `aristoapp/claude-membase` tree plus root/package/plugin metadata:
  https://github.com/aristoapp/claude-membase
- Existing `aristoapp/cursor-membase` tree plus Cursor plugin and MCP metadata:
  https://github.com/aristoapp/cursor-membase
- Existing `aristoapp/hermes-membase` tree plus Python package metadata and
  native plugin YAML:
  https://github.com/aristoapp/hermes-membase
- Existing `aristoapp/openclaw-membase` tree plus package metadata and native
  OpenClaw manifest:
  https://github.com/aristoapp/openclaw-membase

Verification:

- `pnpm check` passed: TypeScript build for core, SDK, Claude adapter, Cursor
  adapter, Hermes adapter, OpenClaw adapter, plus
  `scripts/check-public-surface.sh`.

Next step:

- Add a generated-artifact verification script that imports each adapter and
  verifies committed manifest/MCP config examples stay in sync with generated
  output.

## 2026-06-28 08:03 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and added generated-artifact
  verification for the adapter skeletons.
- Added `scripts/check-generated-artifacts.mjs`, which imports the built Claude,
  Cursor, Hermes, and OpenClaw adapters and compares their default generated
  plugin/MCP artifacts against committed examples under `clients/*` and
  `manifests/*`.
- Updated `pnpm check` so it typechecks, verifies 15 generated artifact files,
  and then runs the public connector surface guard.
- Updated `README.md`, `docs/architecture.md`, and `docs/context.html` to
  document the new verification coverage and next smoke-harness step.

Research/evidence:

- Fresh OSS research was not needed for this mechanical drift guard; evidence
  came from the current adapter exports in `clients/*/src/index.ts` and the
  committed manifest/MCP examples under `clients/*` and `manifests/*`.
- Existing OSS and migration evidence remains recorded in
  `docs/research/oss-targets.md`.

Verification:

- `pnpm check` passed: TypeScript build for core, SDK, Claude adapter, Cursor
  adapter, Hermes adapter, OpenClaw adapter; generated artifact comparison for
  15 files; and `scripts/check-public-surface.sh`.

Next step:

- Start the client smoke test harness from `PLAN.md` run 13, using a documented
  stub path if the shared `@membase/mcp-server` package is not yet available.

## 2026-06-28 08:35 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and added the client smoke test harness
  for Claude, Cursor, Hermes, and OpenClaw.
- Added `smoke/client-smoke.mjs`, which imports the built adapters and verifies
  generated MCP config shape, API key env references, redacted diagnostics, and
  adapter-declared smoke commands.
- Added `smoke/public-contract-stub.mjs` so the smoke harness can exercise the
  public remember/search/context/delete flow without depending on the future
  shared `@membase/mcp-server` runtime package.
- Updated `package.json` with `smoke:dry-run` and `smoke:execute`, and wired the
  dry-run harness into `pnpm check`.
- Updated `README.md`, `smoke/README.md`, `docs/architecture.md`, and
  `docs/context.html` to document smoke coverage and the remaining live MCP
  runtime prerequisite.
- No GitHub, Linear, marketplace, publish, merge, or old-repo deprecation
  action was performed.

Research/evidence:

- Fresh OSS research was not needed for this run; the implementation followed
  the existing SDK `ClientAdapter.smokeTests()` contract and the prior recorded
  MCP/eval research in `docs/research/oss-targets.md`.
- Current evidence is local: four built client adapters, their generated MCP
  configs, and the public contract stub under `smoke/`.

Verification:

- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files, dry-run smoke harness for 4 clients and 8 declared commands, and
  `scripts/check-public-surface.sh`.
- `pnpm smoke:execute` passed: the smoke harness executed the 8 adapter-declared
  local commands.

Next step:

- Start `PLAN.md` run 14: document secret handling and security expectations,
  including local env setup, redaction guarantees, and live MCP smoke
  prerequisites.

## 2026-06-28 09:05 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and completed `PLAN.md` run 14 secret
  handling/security documentation.
- Added `docs/security.md` with the public connector security boundary, local
  env setup, redaction guarantees, ignored env-file rule, live MCP smoke
  prerequisites, and leak-response checklist.
- Added `scripts/check-secret-hygiene.mjs` and wired `pnpm secret-hygiene` into
  `pnpm check` so committed connector artifacts are scanned for raw
  secret-looking values and sensitive MCP env entries must remain references or
  redacted placeholders.
- Updated `.gitignore` to exclude local env files and automation run-state/log
  files.
- Updated `README.md`, `docs/architecture.md`, `docs/migration-parity.md`,
  `smoke/README.md`, and `docs/context.html` to reflect the security guard and
  the current next step.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Fresh OSS research was not needed for this run; the work followed the
  existing `packages/core` env reference/redaction implementation, the dry-run
  smoke harness secret sentinel, and prior recorded adapter/MCP research in
  `docs/research/oss-targets.md`.

Verification:

- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files, dry-run smoke harness for 4 clients and 8 declared commands,
  secret-hygiene scan for 60 files, and `scripts/check-public-surface.sh`.

Next step:

- Start mapping old client repo test coverage into this integrated repo's
  public contract tests versus client-native parity tests.

## 2026-06-28 09:35 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and completed the old client test
  coverage mapping for `MEM-330`.
- Added `docs/test-coverage-parity.md`, mapping old Claude, Cursor, Hermes, and
  OpenClaw test/check coverage into shared connector-contract tests,
  client-native parity tests, launch validation, and deferred runtime
  decisions.
- Updated `README.md`, `docs/architecture.md`, `docs/migration-parity.md`,
  `smoke/README.md`, `docs/research/oss-targets.md`, and `docs/context.html`
  to link the coverage map and make the next `PLAN.md` run explicit.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Refreshed old repo test inventories with GitHub API tree reads and raw
  package/test sampling.
- `aristoapp/claude-membase` evidence: tests, Bun check scripts, manifest
  validation, and Claude plugin validation:
  https://github.com/aristoapp/claude-membase
- `aristoapp/cursor-membase` evidence: no obvious test files in the tree; rules,
  skills, plugin metadata, MCP config, logo, README, and changelog artifacts:
  https://github.com/aristoapp/cursor-membase
- `aristoapp/hermes-membase` evidence: pytest files plus Python package,
  `ruff`, and `mypy` metadata:
  https://github.com/aristoapp/hermes-membase
- `aristoapp/openclaw-membase` evidence: source test files plus build/lint/type
  package metadata:
  https://github.com/aristoapp/openclaw-membase

Verification:

- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files, dry-run smoke harness for 4 clients and 8 declared commands,
  secret-hygiene scan for 61 files, and `scripts/check-public-surface.sh`.

Next step:

- Start `PLAN.md` run 15 by strengthening the Claude and Cursor install docs
  into review-ready flows with config placement, secret references, generated
  artifact checks, and local smoke verification.

## 2026-06-28 10:05 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and strengthened the Claude and Cursor
  install docs for `PLAN.md` run 15.
- Updated `docs/install/claude.md` with project/local MCP config placement,
  plugin-root metadata boundaries, secret references, generated artifact checks,
  local smoke verification, and review checklist.
- Updated `docs/install/cursor.md` with project/global/plugin-local MCP config
  placement, Cursor env interpolation, generated artifact checks, local smoke
  verification, and review checklist.
- Removed a premature Cursor `logo` manifest reference because the marketplace
  asset has not been ported yet, and extended
  `scripts/check-generated-artifacts.mjs` so future relative `logo` or `icon`
  references must point to existing files.
- Updated `README.md`, `docs/architecture.md`, `docs/migration-parity.md`,
  `docs/research/oss-targets.md`, and `docs/context.html` so current status and
  next step point at Hermes/OpenClaw install docs.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Refreshed Claude Code plugin and MCP docs for `.claude-plugin/plugin.json`,
  plugin-root `.mcp.json`, `mcpServers`, config scopes, and environment
  expansion:
  https://docs.anthropic.com/en/docs/claude-code/plugins
  https://docs.anthropic.com/en/docs/claude-code/mcp
- Refreshed Cursor MCP and plugin docs for `.cursor/mcp.json`,
  `~/.cursor/mcp.json`, `${env:NAME}` interpolation, `.cursor-plugin`, and
  plugin-local `mcp.json`:
  https://cursor.com/docs/mcp
  https://cursor.com/docs/plugins
- Rechecked `PostHog/ai-plugin` as a compact plugin/MCP metadata example:
  https://github.com/PostHog/ai-plugin

Verification:

- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files with relative manifest asset validation, dry-run smoke harness for 4
  clients and 8 declared commands, secret-hygiene scan for 61 files, and
  `scripts/check-public-surface.sh`.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Start `PLAN.md` run 16 by strengthening the Hermes and OpenClaw install docs
  into review-ready flows with native metadata placement, MCP config
  translation, secret references, generated artifact checks, and local smoke
  verification.

## 2026-06-28 10:32 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and strengthened the Hermes and
  OpenClaw install docs for `PLAN.md` run 16.
- Updated `docs/install/hermes.md` with native metadata placement, MCP JSON to
  Hermes `mcp_servers` YAML translation, secret references, generated artifact
  checks, local smoke verification, and a review checklist.
- Updated `docs/install/openclaw.md` with native plugin manifest setup, local
  plugin install commands, env-based secret handling, canonical MCP config
  example, generated artifact checks, local smoke verification, and a review
  checklist.
- Updated `docs/architecture.md`, `docs/migration-parity.md`,
  `docs/research/oss-targets.md`, and `docs/context.html` so current status and
  next step point at the marketplace asset checklist.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Reused and refreshed Hermes Agent MCP evidence for `mcp_servers`, `command`,
  `args`, `env`, and optional tool filtering:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md
- Reused Hermes optional MCP manifest evidence as an example of separate
  host-specific metadata:
  https://github.com/NousResearch/hermes-agent/blob/main/optional-mcps/linear/manifest.yaml
- Reused OpenClaw plugin docs for install, enablement, config, gateway restart,
  and runtime inspection:
  https://docs.openclaw.ai/plugins
- Reused OpenClaw manifest docs for `id`, `kind`, `skills`, `uiHints`, and
  strict `configSchema`:
  https://docs.openclaw.ai/plugins/manifest

Verification:

- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files, dry-run smoke harness for 4 clients and 8 declared commands,
  secret-hygiene scan for 61 files, and `scripts/check-public-surface.sh`.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Start `PLAN.md` run 17 by drafting the marketplace asset checklist, including
  reusable old assets, rewritten connector-capability copy, and client-specific
  publishing blockers.

## 2026-06-28 11:04 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and completed `PLAN.md` run 17 by
  drafting the marketplace asset checklist for `MEM-331`.
- Added `docs/marketplace-assets.md` with shared launch copy, support/ownership
  fields, per-client asset inventory, client-specific publishing blockers, and
  the verification gate for future logo/icon changes.
- Updated `README.md`, `docs/architecture.md`, `docs/migration-parity.md`,
  `docs/research/oss-targets.md`, and `docs/context.html` so current status and
  next step point at old repo deprecation planning.
- Kept old Cursor logo and Hermes banner as review candidates only; no
  generated manifest references them until assets are explicitly ported and
  checked.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Rechecked old Claude marketplace descriptor and plugin metadata:
  https://github.com/aristoapp/claude-membase/blob/main/.claude-plugin/marketplace.json
- Rechecked old Cursor plugin metadata and relative logo asset:
  https://github.com/aristoapp/cursor-membase/blob/main/.cursor-plugin/plugin.json
- Rechecked old Hermes banner/native plugin repo:
  https://github.com/aristoapp/hermes-membase
- Rechecked old OpenClaw native manifest:
  https://github.com/aristoapp/openclaw-membase/blob/main/openclaw.plugin.json
- Reused compact marketplace/plugin metadata references from PostHog and Obra:
  https://github.com/PostHog/ai-plugin
  https://github.com/obra/superpowers/tree/main/.claude-plugin

Verification:

- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files, dry-run smoke harness for 4 clients and 8 declared commands,
  secret-hygiene scan for 62 files, and `scripts/check-public-surface.sh`.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Start `PLAN.md` run 18 by drafting the old repo deprecation plan, including
  non-mutating review steps for README notices, archive timing, star
  concentration, and per-client compatibility handoffs.

## 2026-06-28 11:34 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and completed `PLAN.md` run 18 by
  drafting the old repo deprecation and star-concentration plan for `MEM-332`.
- Added `docs/deprecation-plan.md` with non-mutating readiness gates, README
  notice sequencing, compatibility-window expectations, archive prerequisites,
  star-concentration launch guidance, and per-client handoff blockers.
- Updated `README.md`, `docs/architecture.md`, `docs/migration-parity.md`,
  `docs/research/oss-targets.md`, and `docs/context.html` so current status and
  next step point at end-to-end local verification.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Rechecked GitHub archive guidance for read-only archive behavior and
  pre-archive README/description/issue cleanup recommendations:
  https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories
- Rechecked old repo pages and current public snapshots for deprecation
  handoffs:
  https://github.com/aristoapp/claude-membase
  https://github.com/aristoapp/cursor-membase
  https://github.com/aristoapp/hermes-membase
  https://github.com/aristoapp/openclaw-membase

Verification:

- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files, dry-run smoke harness for 4 clients and 8 declared commands,
  secret-hygiene scan for 63 files, and `scripts/check-public-surface.sh`.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Start `PLAN.md` run 19 with end-to-end local verification and a
  review-readiness gap pass across README, architecture docs, generated
  artifacts, smoke checks, security, marketplace assets, migration parity, and
  deprecation planning.

## 2026-06-28 18:18 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and completed the `PLAN.md` run 19
  review-readiness pass with a concrete local guard.
- Added `scripts/check-review-readiness.mjs` to verify required architecture,
  migration parity, test coverage parity, security, marketplace, deprecation,
  install, client, and manifest artifacts.
- Wired the new guard into `pnpm check` as `pnpm review-readiness`.
- Updated `README.md`, `docs/architecture.md`, and `docs/context.html` so the
  local verification docs and context board reflect the new guard.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Fresh OSS research was not needed for this run. The work verified the local
  review artifacts produced from earlier recorded OSS evidence and the Linear
  project scope.

Verification:

- `pnpm review-readiness` passed: 16 shared files and 4 clients checked.
- `pnpm check` passed: TypeScript build, generated artifact comparison for 15
  files, dry-run smoke harness for 4 clients and 8 declared commands,
  secret-hygiene scan for 64 files, public-surface guard, and the new
  review-readiness guard.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Start `PLAN.md` run 20 with a final repo quality pass and Linear-ready
  summary across architecture, scaffolding, shared core, four clients,
  migration parity, marketplace/deprecation docs, and remaining runtime-parity
  decisions.

## 2026-06-28 18:46 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded next step and completed the `PLAN.md` run 20
  final quality pass.
- Added `docs/review-summary.md` as the Linear-ready summary, mapping the
  scheduled definition of done to concrete repo evidence and recording the
  remaining runtime-parity decisions.
- Wired `docs/review-summary.md` into `README.md`,
  `docs/architecture.md`, `docs/context.html`, and
  `scripts/check-review-readiness.mjs` so the final summary is part of local
  review readiness.
- Updated `docs/migration-parity.md` so the next step now points at review and
  runtime-parity decisions rather than the completed run 19 verification pass.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Fresh OSS research was not needed for this run. The work consolidated local
  review evidence from existing architecture, migration, test coverage,
  marketplace, security, deprecation, and smoke-test artifacts.

Verification:

- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, secret-hygiene scan for
  65 files, public-surface guard, and review-readiness guard for 17 shared
  files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Start review from `docs/review-summary.md`, then decide final public repo URL,
  MCP server command/package path, per-client transport precedence, client-native
  runtime parity, and asset reuse before any external launch or deprecation
  mutations.

## 2026-06-28 19:16 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded post-run-20 next step by making the remaining
  runtime and launch decisions reviewable instead of leaving them scattered
  across parity, security, marketplace, and install docs.
- Added `docs/runtime-parity-decisions.md` with a non-mutating decision ledger
  for final public repo URL, MCP server command/package path, per-client
  transport precedence, client-native runtime parity, asset reuse, and live
  client-to-MCP smoke.
- Linked the ledger from `README.md`, `docs/architecture.md`,
  `docs/review-summary.md`, `docs/migration-parity.md`, and
  `docs/context.html`.
- Updated `scripts/check-review-readiness.mjs` so `pnpm check` now requires the
  runtime decision ledger and its review markers alongside the Linear-ready
  summary.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, or
  external mutation action was performed.

Research/evidence:

- Fresh OSS research was not needed for this run. The work consolidated
  unresolved decisions already recorded in local docs from earlier OSS-backed
  runs: `docs/review-summary.md`, `docs/migration-parity.md`,
  `docs/test-coverage-parity.md`, `docs/security.md`,
  `docs/marketplace-assets.md`, and `docs/deprecation-plan.md`.

Verification:

- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, secret-hygiene scan for
  66 files, public-surface guard, and review-readiness guard for 18 shared
  files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Review `docs/runtime-parity-decisions.md` and accept or defer D1-D6 before
  any external launch, live MCP smoke, marketplace submission, or old repo
  deprecation work.

## 2026-06-28 19:48 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the recorded post-run-20 next step by making the future live
  client-to-MCP smoke gate concrete without pretending it is runnable before
  D2, D3, and D6 are accepted.
- Added `docs/live-smoke-runbook.md` with required inputs, live smoke contract,
  test data shape, per-client gate, redaction requirements, acceptance
  checklist, and non-mutating boundary.
- Linked the runbook from `README.md`, `docs/architecture.md`,
  `docs/security.md`, `docs/runtime-parity-decisions.md`,
  `docs/review-summary.md`, and `smoke/README.md`.
- Updated `scripts/check-review-readiness.mjs` so `pnpm check` requires the
  live smoke runbook and its review markers.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed.

Research/evidence:

- Fresh OSS research was not needed for this run. The work formalized the
  pending live-smoke requirements already recorded in
  `docs/runtime-parity-decisions.md`, `docs/security.md`, `smoke/README.md`,
  and `docs/review-summary.md`.

Verification:

- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, secret-hygiene scan for
  67 files, public-surface guard, and review-readiness guard for 19 shared
  files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Review `docs/runtime-parity-decisions.md` and
  `docs/live-smoke-runbook.md`; accept or defer D2, D3, and D6 before adding a
  runnable live MCP smoke command.

## 2026-06-28 20:01 UTC

- Recorded Jaehwan's explicit GitHub update preference for future automation
  runs: keep `https://github.com/aristoapp/membase-plugin-mcp` updated with
  verified local automation results.
- Updated `automation/codex-prompt.md` so future runs may commit and push
  verified repo artifact changes to `origin main`.
- Kept the external mutation boundary narrow: no package publishing,
  marketplace submission, force-push, old-repo archive/delete, unrelated merge,
  or Linear mutation is authorized by this policy.

Verification:

- GitHub repo access was verified with `gh repo view aristoapp/membase-plugin-mcp`.
- `gh auth setup-git` was run so HTTPS git operations can use the existing
  GitHub CLI credentials.

Next step:

- Commit and push the accumulated verified automation outputs to
  `aristoapp/membase-plugin-mcp`.

## 2026-06-28 20:06 UTC

- Committed the accumulated verified automation outputs to local `main`.
- Pushed `main` to `https://github.com/aristoapp/membase-plugin-mcp`.
- Confirmed GitHub `main` now points at commit
  `575d04901e702d578aea003e65d138ece5e43fe0`.

Verification:

- `git status --short --branch` reported local `main` aligned with
  `origin/main` after push.
- `gh api repos/aristoapp/membase-plugin-mcp/commits/main` returned the pushed
  commit and message.

Next step:

- Future automation runs should continue committing and pushing verified repo
  artifact changes to `origin main`, while keeping publishing, marketplace,
  old-repo, and Linear mutations blocked unless explicitly requested.

## 2026-06-28 20:15 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the post-run-20 review-readiness phase by fixing a stale
  internal context-board status: `docs/context.html` now reflects the live
  smoke runbook, GitHub sync record, and current external-mutation boundary.
- Added `docs/context.html` to `scripts/check-review-readiness.mjs` so future
  `pnpm check` runs fail if the context board or its core status markers are
  missing.
- Updated `docs/review-summary.md` with the latest local verification time.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Fresh OSS research was not needed for this narrow status-consistency guard.
  Evidence came from current local docs and the prior `RUN_LOG.md` GitHub sync
  entry.

Verification:

- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, secret-hygiene scan for
  67 files, public-surface guard, and review-readiness guard for 20 shared
  files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Review `docs/runtime-parity-decisions.md` and `docs/live-smoke-runbook.md`;
  accept or defer D2, D3, and D6 before adding a runnable live MCP smoke
  command.

## 2026-06-28 20:29 UTC

- Recorded Jaehwan's review decisions in `docs/runtime-parity-decisions.md`:
  D1 accepted as `https://github.com/aristoapp/membase-plugin-mcp`, D5 accepted
  as client README-level asset reuse guidance, and D6 accepted in principle
  pending D2/D3.
- Expanded D2, D3, and D4 with detailed decision notes covering the MCP runtime
  command/package path, local stdio versus remote transport precedence, and
  client-native runtime parity scope.
- Verified that `@membase/mcp-server` is not currently available from the
  public npm registry, so D2 still needs either package publication, a different
  package name, or a local runtime path before live smoke can run honestly.
- Added `Marketplace Asset Reuse` sections to each client README and updated
  `docs/marketplace-assets.md` so asset reuse guidance lives with the client
  adapter docs while generated manifests remain asset-free until files are
  copied and checked.
- Tightened `scripts/check-review-readiness.mjs` so each client README must keep
  its asset reuse guidance and `pnpm generated-artifacts` marker.
- Updated `docs/context.html` and `docs/review-summary.md` with the latest
  decision and verification state.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Local repo evidence: generated MCP examples in `manifests/*/mcp.json`,
  adapter constants in `clients/*/src/index.ts`, and existing marketplace
  asset notes in `docs/marketplace-assets.md`.
- Registry check: `npm view @membase/mcp-server name version bin dist-tags
  --json` returned npm 404 on 2026-06-28.

Verification:

- First `pnpm check` correctly failed because the new review-readiness marker
  caught a missing `pnpm generated-artifacts` note in `clients/hermes/README.md`.
- After fixing the Hermes README marker, `pnpm check` passed: generated
  artifact comparison for 15 files, dry-run smoke harness for 4 clients and 8
  declared commands, secret-hygiene scan for 67 files, public-surface guard,
  and review-readiness guard for 20 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Decide D2 concretely: publish `@membase/mcp-server`, choose a different
  package, provide a local runtime command, or choose a remote MCP endpoint.
  Then D3 transport precedence can be locked and `pnpm smoke:live` can be
  implemented under the accepted D6 gate.

## 2026-06-28 20:49 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Continued from the D2/D3 blocker by adding a non-network live-smoke preflight
  instead of pretending live MCP smoke is runnable before the runtime command
  and transport path are accepted.
- Added `smoke/live-smoke-preflight.mjs`, which verifies that D2 remains marked
  as needing the MCP runtime command decision, D3 remains marked as needing
  transport precedence, D6 remains accepted only in principle, and the committed
  MCP examples still use the documented placeholder runtime with API-key env
  references.
- Wired `pnpm smoke:live:preflight` into `pnpm check` and
  `scripts/check-review-readiness.mjs`.
- Updated `README.md`, `docs/architecture.md`, `docs/live-smoke-runbook.md`,
  `docs/runtime-parity-decisions.md`, `docs/review-summary.md`,
  `docs/context.html`, and `smoke/README.md` so review docs consistently state
  that live smoke is blocked but now guarded by preflight.
- Corrected `docs/review-summary.md` so the previous explicitly authorized
  GitHub `origin/main` sync is not described as if no GitHub mutation had ever
  happened.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked the public npm registry for the placeholder package:
  https://registry.npmjs.org/@membase%2fmcp-server
- `npm view @membase/mcp-server name version bin dist-tags --json` still
  returned npm 404 on 2026-06-28.
- Local evidence: generated MCP examples under `manifests/*/mcp.json`,
  `docs/runtime-parity-decisions.md`, and `docs/live-smoke-runbook.md`.

Verification:

- `pnpm smoke:live:preflight` passed: D2/D3 remain blocked, D6 is pending those
  decisions, and 4 MCP configs keep the documented placeholder runtime.
- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, live-smoke preflight,
  secret-hygiene scan for 68 files, public-surface guard, and review-readiness
  guard for 22 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Decide D2 concretely: publish `@membase/mcp-server`, choose a different
  package, provide a local runtime command, or choose a remote MCP endpoint.
  Then lock D3 transport precedence and replace the blocked preflight with a
  real `pnpm smoke:live` implementation under the accepted D6 gate.

## 2026-06-28 21:10 UTC

- Updated `PLAN.md` with the post-20 runtime parity plan.
- Changed the plan from a single generic MCP package path to preserving the
  existing client-specific runtime and packaging paths first:
  - Claude Code: plugin-local stdio runtime and Claude plugin validation.
  - Cursor: HTTP MCP endpoint first, with local stdio only as an explicit
    secondary path.
  - Hermes Agent: Python package/native provider path and build/test/verify-dist
    checks, with publish disabled until requested.
  - OpenClaw: native extension package path, Bun typecheck/build, and manifest
    parity.
- Updated `docs/runtime-parity-decisions.md` so D2/D3/D4 now reflect
  client-specific runtime package paths, per-client transport precedence, and a
  packaging/action parity-first migration order.
- Updated `docs/migration-parity.md`, `README.md`, `docs/architecture.md`,
  `docs/live-smoke-runbook.md`, `docs/review-summary.md`,
  `docs/context.html`, and `smoke/README.md` so summary docs no longer imply
  that `@membase/mcp-server` should be the forced default for every client.
- Confirmed the current worktree now includes `docs/packaging-action-parity.md`
  and `scripts/check-packaging-action-parity.mjs`, with the parity guard wired
  into `pnpm check`.
- Updated `smoke/live-smoke-preflight.mjs` so it guards the new state: D2/D3
  remain implementation-pending, D6 remains pending those runtime paths, and
  current placeholder MCP examples are still honestly marked as placeholders.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old repo packaging and workflow evidence:
  - `aristoapp/claude-membase`: Bun `check` workflow, Claude plugin validation,
    plugin-local `scripts/mcp-server.cjs`.
  - `aristoapp/cursor-membase`: `.cursor-plugin/plugin.json`, HTTP MCP
    `https://mcp.membase.so/mcp`, rules, skills, logo.
  - `aristoapp/hermes-membase`: `pyproject.toml`, `Makefile`, PyPI publish
    workflow, native plugin YAML.
  - `aristoapp/openclaw-membase`: npm/Bun package metadata, native OpenClaw
    manifest, check workflow, extension entrypoint.

Verification:

- First `pnpm check` failed because `smoke/live-smoke-preflight.mjs` still
  expected the old D2/D3 wording. Updated the preflight guard to match the new
  runtime-parity plan.
- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, live-smoke preflight,
  packaging/action parity guard, secret-hygiene scan for 70 files,
  public-surface guard, and review-readiness guard for 24 shared files and 4
  clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Use `docs/packaging-action-parity.md` to add the next concrete
  non-publishing checks, then start replacing placeholder MCP examples with
  client-specific runtime configs.

## 2026-06-28 21:18 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, and `git status`.
- Added `docs/packaging-action-parity.md` with per-client package/workflow
  evidence and non-publishing parity targets for Claude Code, Cursor, Hermes
  Agent, and OpenClaw.
- Added `scripts/check-packaging-action-parity.mjs` and wired it into
  `pnpm check`.
- Updated README, architecture, migration parity, test coverage parity,
  runtime decision, review summary, and context board docs to reference the new
  guard.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old repo package/workflow sources:
  - https://raw.githubusercontent.com/aristoapp/claude-membase/main/package.json
  - https://raw.githubusercontent.com/aristoapp/claude-membase/main/.github/workflows/check.yml
  - https://raw.githubusercontent.com/aristoapp/cursor-membase/main/mcp.json
  - https://api.github.com/repos/aristoapp/cursor-membase/contents/.github/workflows?ref=main
  - https://raw.githubusercontent.com/aristoapp/hermes-membase/main/pyproject.toml
  - https://raw.githubusercontent.com/aristoapp/hermes-membase/main/.github/workflows/publish.yml
  - https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/package.json
  - https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/.github/workflows/check.yml

Verification:

- `pnpm packaging-action-parity` passed.
- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, live-smoke preflight,
  packaging/action parity guard, secret-hygiene scan for 70 files,
  public-surface guard, and review-readiness guard for 24 shared files and
  4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Convert the packaging/action map into the first host-specific local parity
  check, starting with the safest non-publishing target: OpenClaw typecheck/build
  or Hermes Python build verification, before replacing placeholder MCP examples
  with client-specific runtime configs.

## 2026-06-28 21:50 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory, and `git status`.
- Continued from the packaging/action parity map by adding the first
  host-specific non-publishing parity gate for OpenClaw.
- Added `scripts/check-openclaw-native-parity.mjs`, which verifies the local
  OpenClaw package stays private and non-publishing, checks native manifest
  basics, then runs the integrated OpenClaw typecheck and build path.
- Wired `pnpm openclaw:native-parity` into `pnpm check`.
- Updated README, architecture, packaging parity, migration parity, test
  coverage parity, runtime decision, review summary, smoke, OpenClaw README,
  and context board docs to record that OpenClaw is the first completed local
  parity gate while Claude, Cursor, and Hermes remain pending.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old OpenClaw package/workflow sources:
  - https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/package.json
  - https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/.github/workflows/check.yml
  - https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/openclaw.plugin.json
  - https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/index.ts

Verification:

- First `pnpm openclaw:native-parity` failed because the guard treated
  `apiKeyEnv` as a raw secret default. The guard was narrowed so environment
  variable name defaults such as `MEMBASE_API_KEY` are allowed while raw token,
  secret, or password defaults remain forbidden.
- `pnpm openclaw:native-parity` passed.
- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, live-smoke preflight,
  packaging/action parity guard, OpenClaw native parity gate, secret-hygiene
  scan for 71 files, public-surface guard, and review-readiness guard for
  25 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Add the next host-specific non-publishing parity check, preferably Hermes
  Python build/distribution verification, while keeping PyPI publish disabled.

## 2026-06-28 22:21 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory, and `git status`.
- Continued from the packaging/action parity queue by adding the next
  host-specific non-publishing parity gate for Hermes Agent.
- Added `clients/hermes/python/` as a local Python package review scaffold with
  `pyproject.toml`, dry-run `hermes-membase` and `hermes-membase-install`
  console script entrypoints, and a package-data copy of the native Hermes
  plugin YAML.
- Added `scripts/check-hermes-python-parity.mjs`, which validates Hermes package
  metadata, console script entrypoints, native YAML sync with
  `clients/hermes/plugin/plugin.yaml`, Python syntax, and non-publishing
  boundaries.
- Wired `pnpm hermes:python-parity` into `pnpm check`.
- Updated README, Hermes install/client docs, architecture, packaging parity,
  migration parity, test coverage parity, runtime decision, review summary,
  smoke docs, and context board docs to record Hermes as a completed local
  parity gate while provider runtime behavior remains pending.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old Hermes package metadata:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/pyproject.toml
- Rechecked old Hermes build/check/verify-dist targets:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/Makefile
- Rechecked old Hermes tag-based PyPI publish workflow:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/.github/workflows/publish.yml

Verification:

- `pnpm hermes:python-parity` passed.
- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, live-smoke preflight,
  packaging/action parity guard, Hermes Python parity gate, OpenClaw native
  parity gate, secret-hygiene scan for 78 files, public-surface guard, and
  review-readiness guard for 26 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Add the next safe non-publishing parity check, likely Claude plugin
  validation if it can run locally without marketplace submission, or Cursor
  metadata/rules/skills snapshot checks after those assets are ported and
  rewritten to the connector-capability boundary.

## 2026-06-28 22:52 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory, and `git status`.
- Continued from the host-specific non-publishing parity queue by adding the
  Claude plugin parity gate.
- Added `scripts/check-claude-plugin-parity.mjs`, which checks Claude
  manifest/package version drift, required connector-capability metadata,
  canonical MCP secret references, and then runs
  `claude plugin validate clients/claude` with the installed Claude Code CLI.
- Wired `pnpm claude:plugin-parity` into `pnpm check`.
- Updated README, Claude install/client docs, architecture, packaging parity,
  migration parity, test coverage parity, runtime decision ledger, review
  summary, smoke docs, and context board so Claude is recorded as a completed
  local parity gate while commands/hooks/skills/runtime behavior remain
  pending explicit migration decisions.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old Claude package scripts:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/package.json
- Rechecked old Claude check workflow:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/.github/workflows/check.yml
- Rechecked old Claude plugin manifest and MCP config shape:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.claude-plugin/plugin.json
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.mcp.json
- Local evidence: Claude Code CLI was available as `claude` version
  `2.1.187`, and `claude plugin validate clients/claude` passed.

Verification:

- `pnpm claude:plugin-parity` passed.
- `pnpm packaging-action-parity` passed.
- `pnpm review-readiness` passed.
- `pnpm check` passed: generated artifact comparison for 15 files, dry-run
  smoke harness for 4 clients and 8 declared commands, live-smoke preflight,
  packaging/action parity guard, Claude plugin parity gate, Hermes Python
  parity gate, OpenClaw native parity gate, secret-hygiene scan for 79 files,
  public-surface guard, and review-readiness guard for 27 shared files and
  4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Add the next safe Cursor parity step: preserve the old HTTP MCP-first
  transport and add metadata/rules/skills snapshot checks only after those
  artifacts are ported and rewritten to the connector-capability boundary.

## 2026-06-28 23:26 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Continued from the Cursor parity step by preserving the old Cursor HTTP
  MCP-first transport in generated adapter output.
- Extended `packages/core` with an HTTP MCP server config shape while keeping
  existing stdio config generation for Claude, Hermes, and OpenClaw.
- Updated `clients/cursor/src/index.ts`, `clients/cursor/mcp.json`, and
  `manifests/cursor/mcp.json` so Cursor now points at
  `https://mcp.membase.so/mcp` with a headers object instead of the generic
  `@membase/mcp-server` placeholder.
- Added `scripts/check-cursor-transport-parity.mjs`, wired
  `pnpm cursor:transport-parity` into `pnpm check`, and updated smoke/preflight
  checks so Cursor HTTP is allowed while the other D2/D3 runtime paths remain
  blocked.
- Updated README, Cursor install/client docs, architecture, security, runtime
  decision ledger, packaging/action parity, migration/test parity, marketplace,
  deprecation, research notes, review summary, smoke docs, and context board.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old Cursor MCP config:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/mcp.json
- Rechecked old Cursor plugin metadata:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/.cursor-plugin/plugin.json
- Rechecked old Cursor repo contents for rules, skills, logo, README, and
  changelog artifacts:
  https://github.com/aristoapp/cursor-membase

Verification:

- First `pnpm cursor:transport-parity` failed because the new package script
  line was accidentally appended outside the JSON object. Moved it into
  `package.json` scripts and reran the guard.
- `pnpm cursor:transport-parity` passed.
- `pnpm generated-artifacts` passed: TypeScript build and generated artifact
  comparison for 15 files.
- `pnpm smoke:live:preflight` passed with Cursor HTTP preserved and remaining
  runtime paths blocked.
- `pnpm check` passed: generated artifacts, dry-run smoke harness for 4 clients
  and 8 declared commands, live-smoke preflight, packaging/action parity,
  Claude plugin parity, Cursor transport parity, Hermes Python parity, OpenClaw
  native parity, secret-hygiene scan for 80 files, public-surface guard, and
  review-readiness guard for 28 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Add the next Cursor-safe parity artifact only after deciding whether to port
  rules, skills, logo, or changelog text; otherwise continue with remaining
  runtime paths: Claude plugin-local stdio, Hermes Python/native provider, and
  OpenClaw native extension entrypoint.

## 2026-06-28 23:51 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Continued from the remaining runtime-path queue by preserving Claude's old
  plugin-local stdio MCP path in generated config artifacts.
- Extended `packages/core` stdio MCP generation with client-specific extra env
  support, then updated `clients/claude/src/index.ts`,
  `clients/claude/.mcp.json`, and `manifests/claude/mcp.json` to use
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs` with
  `MEMBASE_CLAUDE_PLUGIN=1` and shared Membase env references.
- Expanded generated-artifact, review-readiness, Claude plugin parity,
  Cursor transport parity, and live-smoke preflight guards so Claude
  plugin-local and Cursor HTTP-first paths are both treated as preserved while
  Hermes/OpenClaw runtime paths remain pending.
- Updated Claude install docs, runtime decision ledger, smoke docs, security
  notes, migration/test/packaging parity docs, review summary, research notes,
  and context board.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old Claude plugin-local MCP config:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.mcp.json

Verification:

- `pnpm generated-artifacts` passed: TypeScript build and generated artifact
  comparison for 16 files.
- `pnpm claude:plugin-parity` passed.
- `pnpm smoke:live:preflight` passed with Claude plugin-local MCP and Cursor
  HTTP MCP preserved while Hermes/OpenClaw runtime paths remain blocked.
- First `pnpm check` run failed because `scripts/check-cursor-transport-parity.mjs`
  still expected the old D2/D3 wording. Updated the guard to the new
  Claude+Cursor preserved status.
- Final `pnpm check` passed: generated artifacts, dry-run smoke harness for
  4 clients and 8 declared commands, live-smoke preflight, packaging/action
  parity, Claude plugin parity, Cursor transport parity, Hermes Python parity,
  OpenClaw native parity, secret-hygiene scan for 81 files, public-surface
  guard, and review-readiness guard for 28 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue remaining runtime parity with the next smallest accepted path:
  Hermes Python/native provider runtime config or OpenClaw native extension
  entrypoint. Deeper Claude commands/hooks/skills should wait for explicit
  feature-group acceptance.

## 2026-06-29 00:24 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Continued from the remaining runtime parity queue by preserving the OpenClaw
  native extension entrypoint without porting hook/tool behavior or adding an
  MCP-only fallback.
- Added `openclaw.extensions` to `clients/openclaw/package.json`, pointing at
  the built review entrypoint `./dist/index.js`.
- Added a default `openClawNativeExtension` export from
  `clients/openclaw/src/index.ts` with connector metadata and a no-op local
  register boundary.
- Expanded `scripts/check-openclaw-native-parity.mjs` so it verifies the
  `openclaw.extensions` metadata, builds the package, imports the built
  entrypoint, and checks the default extension export.
- Updated OpenClaw install/client docs, runtime decision ledger, live-smoke
  preflight wording, packaging/migration/test parity docs, marketplace and
  deprecation plans, security notes, review summary, smoke docs, and context
  board to distinguish completed OpenClaw entrypoint parity from pending
  OpenClaw hook/tool runtime behavior.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, or external mutation action was performed in this run.

Research/evidence:

- Rechecked old OpenClaw package metadata and extension entrypoint field:
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/package.json
- Rechecked old OpenClaw extension module shape:
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/src/index.ts

Verification:

- `pnpm --filter @membase/client-openclaw typecheck` passed.
- `pnpm openclaw:native-parity` passed.
- `pnpm smoke:live:preflight` passed with Claude plugin-local MCP, Cursor HTTP
  MCP, and OpenClaw native entrypoint preserved while Hermes runtime remains
  pending.
- `pnpm cursor:transport-parity` passed.
- `pnpm review-readiness` passed.
- `pnpm check` passed: generated artifacts, dry-run smoke harness for
  4 clients and 8 declared commands, live-smoke preflight, packaging/action
  parity, Claude plugin parity, Cursor transport parity, Hermes Python parity,
  OpenClaw native parity, secret-hygiene scan for 81 files, public-surface
  guard, and review-readiness guard for 28 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue remaining runtime parity with Hermes Python/native provider runtime
  behavior, or start an explicit OpenClaw hook/tool parity batch if accepted.

## 2026-06-29 04:55 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Continued from the remaining runtime parity queue by adding the next safe
  Hermes Python/provider boundary step without enabling live API calls,
  publishing, installing globally, or mutating Hermes config.
- Added `clients/hermes/python/src/hermes_membase/provider.py` with a
  review-safe `MembaseMemoryProvider` that exposes only remember, search, task
  context, and forget tool schemas.
- Added Hermes native plugin register shims at
  `clients/hermes/python/src/hermes_membase/plugin/__init__.py` and
  `clients/hermes/python/src/hermes_membase/plugin/cli.py`.
- Expanded `scripts/check-hermes-python-parity.mjs` so it validates provider
  import, fake Hermes `register(ctx)` behavior, public tool names, CLI
  registration, Python syntax, native YAML sync, and non-publishing boundaries.
- Updated README, Hermes client/install docs, architecture, runtime decision
  ledger, live-smoke preflight, smoke docs, migration/test/packaging parity
  docs, security, marketplace/deprecation docs, review summary, and context
  board to record Hermes provider import/register parity while keeping Hermes
  live API behavior pending.
- Updated `scripts/check-cursor-transport-parity.mjs` after the first full
  check showed it still expected the previous D2/D3 wording.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Rechecked old Hermes provider class and methods:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/src/membase_hermes/provider.py
- Rechecked old Hermes plugin register shim:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/src/membase_hermes/plugin/__init__.py
- Rechecked old Hermes plugin CLI shim:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/src/membase_hermes/plugin/cli.py

Verification:

- `pnpm hermes:python-parity` passed.
- `pnpm smoke:live:preflight` passed with Claude plugin-local MCP, Cursor HTTP
  MCP, Hermes provider register path, and OpenClaw native entrypoint preserved
  while Hermes live API behavior remains pending.
- First `pnpm check` run failed because `scripts/check-cursor-transport-parity.mjs`
  still expected the old D2/D3 runtime ledger wording. Updated the guard and
  reran checks.
- `pnpm cursor:transport-parity` passed.
- Final `pnpm check` passed: generated artifacts, dry-run smoke harness for
  4 clients and 8 declared commands, live-smoke preflight, packaging/action
  parity, Claude plugin parity, Cursor transport parity, Hermes Python parity,
  OpenClaw native parity, secret-hygiene scan for 84 files, public-surface
  guard, and review-readiness guard for 28 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue with the next explicitly safe runtime parity batch: Hermes live API
  behavior after package/runtime ownership is accepted, or OpenClaw hook/tool
  parity if that batch is accepted first.

## 2026-06-29 05:18 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Chose the next safe verification-hardening step from the post-20 queue
  instead of adding live API behavior or external mutations.
- Added `scripts/check-core-contract.mjs`, a standalone shared-core contract
  guard for config defaults, env-derived config, MCP env references, HTTP MCP
  config shape, validation errors, and diagnostic redaction.
- Wired `pnpm core:contract` into `package.json` and `pnpm check`, and updated
  `scripts/check-review-readiness.mjs` so the review-readiness guard verifies
  the new core-contract gate remains part of the local launch check path.
- Updated README, architecture, security, test coverage parity, review summary,
  and context board docs to record the new shared-core guard without exposing
  Membase internals.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Used local source-of-truth and verification files for this safe hardening
  step: `PLAN.md`, `docs/test-coverage-parity.md`,
  `packages/core/src/index.ts`, `smoke/client-smoke.mjs`, and
  `scripts/check-review-readiness.mjs`.
- No new OSS lookup was needed because this run only guarded the existing
  shared core contract already defined in this repo.

Verification:

- `pnpm core:contract` passed.
- `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, packaging/action parity, Claude plugin parity, Cursor transport
  parity, Hermes Python parity, OpenClaw native parity, secret-hygiene scan
  for 85 files, public-surface guard, and review-readiness guard for 29 shared
  files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue with explicitly accepted runtime parity only: Hermes live API
  behavior after package/runtime ownership is accepted, OpenClaw hook/tool
  parity if that batch is accepted first, or Cursor rules/skills/assets as a
  review-only snapshot batch.

## 2026-06-29 05:52 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Chose the next safe verification-hardening step from the post-20 queue:
  Cursor rules/skills/assets as a review-only snapshot batch, without copying
  old content or enabling marketplace, publish, GitHub, Linear, live MCP, or
  old-repo mutation actions.
- Added `clients/cursor/native-artifacts.json`, a structured snapshot of the
  old Cursor repo's plugin metadata, MCP config, `rules/membase.mdc`, four
  skill files, `assets/logo.svg`, and changelog evidence with blob SHAs and
  deferred statuses.
- Added `scripts/check-cursor-native-artifacts.mjs`, wired
  `pnpm cursor:native-artifacts` into `pnpm check`, and updated packaging and
  review-readiness guards so the snapshot gate stays part of the local launch
  check path.
- Updated README, Cursor install/client docs, architecture, migration parity,
  test coverage parity, runtime decision ledger, marketplace/deprecation docs,
  research notes, review summary, and context board to record that Cursor
  rules/skills/logo/changelog are snapshot-guarded but not ported.
- Kept generated Cursor manifests free of `logo` or `icon` fields until an
  asset file is copied and explicitly approved.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Rechecked the old Cursor repo recursive tree at
  `177d29c78b2f4698ead9d5108eedeae5b6b059b7`:
  https://api.github.com/repos/aristoapp/cursor-membase/git/trees/main?recursive=1
- Rechecked old Cursor plugin metadata and logo reference:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/.cursor-plugin/plugin.json
- Rechecked old Cursor HTTP MCP config:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/mcp.json
- Rechecked old Cursor changelog for the zero-dependency HTTP MCP shift and
  rules/skills history:
  https://raw.githubusercontent.com/aristoapp/cursor-membase/main/CHANGELOG.md

Verification:

- First `pnpm cursor:native-artifacts` failed because
  `docs/packaging-action-parity.md` and `clients/cursor/README.md` were missing
  exact evidence markers. Added the markers and reran.
- `pnpm cursor:native-artifacts` passed.
- `pnpm packaging-action-parity` passed.
- `pnpm review-readiness` passed.
- Final `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, packaging/action parity, Claude plugin parity, Cursor transport
  parity, Cursor native artifact snapshot, Hermes Python parity, OpenClaw
  native parity, secret-hygiene scan for 87 files, public-surface guard, and
  review-readiness guard for 30 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue with explicitly accepted runtime or artifact parity only: rewrite
  and port Cursor rules/skills/assets after review, Hermes live API behavior
  after package/runtime ownership is accepted, or OpenClaw hook/tool parity if
  that batch is accepted first.

## 2026-06-29 06:23 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Chose the next safe artifact-parity batch from the post-20 queue: Claude
  native commands/hooks/skills/agent/runtime/session-start evidence as a
  review-only snapshot, without copying old behavior or enabling marketplace,
  publish, GitHub, Linear, live MCP, or old-repo mutation actions.
- Added `clients/claude/native-artifacts.json`, a structured snapshot of the
  old Claude repo's plugin metadata, MCP config, workflow/package evidence,
  command files, hook config, skill files, agent file, bundled runtime scripts,
  and session-start evidence with tree/blob SHA evidence and deferred statuses.
- Added `scripts/check-claude-native-artifacts.mjs`, wired
  `pnpm claude:native-artifacts` into `pnpm check`, packaging parity, and
  review-readiness.
- Updated README, Claude install/client docs, architecture, migration parity,
  test coverage parity, packaging/action parity, runtime decision ledger,
  marketplace/deprecation docs, research notes, review summary, and context
  board to record that Claude native artifacts are snapshot-guarded but not
  ported.
- Kept generated Claude manifests free of native command/hook/skill/agent
  declarations until those behaviors are explicitly accepted for migration.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Rechecked the old Claude repo recursive tree at
  `51c15ab3e05bd4f82847c98dd70f926f9eae4459`:
  https://api.github.com/repos/aristoapp/claude-membase/git/trees/main?recursive=1
- Rechecked old Claude plugin metadata:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.claude-plugin/plugin.json
- Rechecked old Claude plugin-local MCP config:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/plugin/.mcp.json
- Rechecked old Claude package/workflow evidence:
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/package.json
  https://raw.githubusercontent.com/aristoapp/claude-membase/main/.github/workflows/check.yml

Verification:

- First `pnpm claude:native-artifacts` failed because
  `docs/packaging-action-parity.md` was missing the exact
  `plugin/commands/login.md` evidence marker. Added the marker and reran.
- `pnpm claude:native-artifacts` passed.
- `pnpm packaging-action-parity` passed.
- `pnpm review-readiness` passed.
- Final `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, packaging/action parity, Claude plugin parity, Claude native
  artifact snapshot, Cursor transport parity, Cursor native artifact snapshot,
  Hermes Python parity, OpenClaw native parity, secret-hygiene scan for
  89 files, public-surface guard, and review-readiness guard for 31 shared
  files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue with explicitly accepted runtime or artifact parity only: rewrite
  and port Claude commands/hooks/skills or Cursor rules/skills/assets after
  review, Hermes live API behavior after package/runtime ownership is accepted,
  or OpenClaw hook/tool parity if that batch is accepted first.

## 2026-06-29 06:56 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Chose the next safe artifact-parity batch from the post-20 queue: OpenClaw
  native commands/hooks/tools/config/update/test evidence as a review-only
  snapshot, without copying old behavior or enabling marketplace, publish,
  GitHub, Linear, live MCP, or old-repo mutation actions.
- Added `clients/openclaw/native-artifacts.json`, a structured snapshot of the
  old OpenClaw repo's package metadata, check workflow, native manifest,
  command CLI, hooks, tools, config helpers, update checks, and runtime tests
  with tree/blob SHA evidence and deferred statuses.
- Added `scripts/check-openclaw-native-artifacts.mjs`, wired
  `pnpm openclaw:native-artifacts` into `pnpm check`, packaging parity, and
  review-readiness.
- Updated README, OpenClaw install/client docs, architecture, migration parity,
  test coverage parity, packaging/action parity, runtime decision ledger,
  deprecation docs, research notes, review summary, and context board to record
  that OpenClaw native artifacts are snapshot-guarded but not ported.
- Kept generated OpenClaw manifests free of command, hook, or tool
  declarations until those behaviors are explicitly accepted for migration.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Rechecked the old OpenClaw repo recursive tree at
  `b5e2838cd053ab833426aaaf03b47a8b9921ad25`:
  https://api.github.com/repos/aristoapp/openclaw-membase/git/trees/main?recursive=1
- Rechecked old OpenClaw package metadata:
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/package.json
- Rechecked old OpenClaw native manifest:
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/openclaw.plugin.json
- Rechecked old OpenClaw check workflow:
  https://raw.githubusercontent.com/aristoapp/openclaw-membase/main/.github/workflows/check.yml

Verification:

- First `pnpm openclaw:native-artifacts` failed because the expected doc
  markers had not yet been added. Added the markers and reran.
- `pnpm openclaw:native-artifacts` passed.
- `pnpm packaging-action-parity` passed.
- `pnpm review-readiness` passed.
- Final `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, packaging/action parity, Claude plugin parity, Claude native
  artifact snapshot, Cursor HTTP transport parity, Cursor native artifact
  snapshot, Hermes Python parity, OpenClaw native artifact snapshot, OpenClaw
  native parity, secret-hygiene scan for 91 files, public-surface guard, and
  review-readiness guard for 32 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue with explicitly accepted runtime or artifact parity only: rewrite
  and port OpenClaw hooks/tools, Claude commands/hooks/skills, or Cursor
  rules/skills/assets after review, or implement Hermes live API behavior after
  package/runtime ownership is accepted.

## 2026-06-29 09:19 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, memory skill guidance, and
  `git status`.
- Chose the next smallest review-hardening step from the post-20 queue: keep
  launch handoff docs consistent after D1 accepted the public repository URL,
  without selecting a release tag, publishing, marketplace submission, Linear
  update, old-repo mutation, or runtime behavior port.
- Added `scripts/check-launch-handoff-consistency.mjs`, wired
  `pnpm launch-handoff` into `pnpm check`, and made
  `scripts/check-review-readiness.mjs` require the new guard.
- Synchronized D1 public repo URL state across
  `docs/runtime-parity-decisions.md`, `docs/deprecation-plan.md`,
  `docs/marketplace-assets.md`, and `docs/review-summary.md` while keeping the
  release tag or bundle path as a launch-time decision.
- Added explicit `No External Mutations` sections to marketplace and
  deprecation planning docs so review handoff docs preserve the local-only
  launch boundary.
- Updated README, architecture, test coverage parity, review summary, and
  context board to include the new launch handoff consistency gate.

Research/evidence:

- Fresh OSS lookup was not needed for this guard-only step. Evidence came from
  the current local source-of-truth and handoff artifacts:
  `docs/runtime-parity-decisions.md`, `docs/deprecation-plan.md`,
  `docs/marketplace-assets.md`, `docs/review-summary.md`, `README.md`, and
  `package.json`.

Verification:

- Initial `pnpm launch-handoff` failed because marketplace and deprecation docs
  did not expose the exact `No External Mutations` marker. Added the explicit
  sections and reran.
- `pnpm launch-handoff` passed.
- Final `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, runtime decision ledger guard, launch handoff consistency guard,
  packaging/action parity, version parity, Claude plugin parity, Claude native
  artifact snapshot, Cursor HTTP transport parity, Cursor native artifact
  snapshot, Hermes Python parity, Hermes native artifact snapshot, OpenClaw
  native artifact snapshot, OpenClaw native parity, secret-hygiene scan for
  96 files, public-surface guard, and review-readiness guard for 36 shared
  files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.
- `git diff --check` passed.
- Committed and pushed verified integrated-repo changes to `origin/main`:
  `b3cea6b` (`chore: guard launch handoff consistency`).

Next step:

- Continue with explicitly accepted runtime or artifact parity only: choose a
  reviewed batch such as Claude commands/hooks/skills, Cursor rules/skills/logo,
  Hermes live provider behavior, or OpenClaw hooks/tools, or keep hardening
  local review guards if those runtime batches are not yet accepted.

## 2026-06-29 08:49 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, memory skill guidance, and
  `git status`.
- Chose the next smallest safe review-hardening step from the post-20 plan:
  make the runtime decision ledger executable instead of porting unaccepted
  client-native behavior.
- Added `scripts/check-runtime-decision-ledger.mjs`, which verifies the D1-D6
  decision rows, the current blocked live-smoke state, the unresolved
  `@membase/mcp-server` placeholder evidence, and the non-mutating review
  boundary.
- Wired `pnpm runtime-decision-ledger` into `pnpm check` and
  `scripts/check-review-readiness.mjs`.
- Updated README, architecture, test coverage parity, review summary, and
  context board so the new guard is visible in the review path.
- Kept public connector surfaces capability-only and did not port Claude
  commands/hooks/skills, Cursor rules/skills/assets, Hermes live behavior, or
  OpenClaw hooks/tools without an explicit migration decision.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Fresh OSS lookup was not needed for this guard-only step. Evidence came from
  current local review artifacts: `PLAN.md`,
  `docs/runtime-parity-decisions.md`, `docs/review-summary.md`,
  `smoke/live-smoke-preflight.mjs`, and `package.json`.

Verification:

- `pnpm runtime-decision-ledger` passed.
- Final `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, runtime decision ledger guard, packaging/action parity, version
  parity, Claude plugin parity, Claude native artifact snapshot, Cursor HTTP
  transport parity, Cursor native artifact snapshot, Hermes Python parity,
  Hermes native artifact snapshot, OpenClaw native artifact snapshot,
  OpenClaw native parity, secret-hygiene scan for 95 files, public-surface
  guard, and review-readiness guard for 35 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.
- `git diff --check` passed.

Next step:

- Continue only with explicitly accepted runtime or artifact parity. Candidate
  batches remain Claude commands/hooks/skills, Cursor rules/skills/assets,
  Hermes live provider behavior, or OpenClaw hooks/tools after review accepts
  that behavior.

## 2026-06-29 08:24 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Chose the next safe review-hardening step from the post-20 queue: Hermes
  native artifact snapshot parity before any live provider behavior, package
  publish workflow, marketplace submission, GitHub, Linear, old-repo mutation,
  or client-runtime behavior port.
- Added `clients/hermes/native-artifacts.json`, a structured review-only
  snapshot of the old Hermes repo's package metadata, publish workflows,
  plugin/register files, provider, capture, CLI, OAuth, wiki, formatting,
  banner asset, update-check, and runtime test evidence with tree/blob SHA
  evidence and deferred statuses.
- Added `scripts/check-hermes-native-artifacts.mjs`, wired
  `pnpm hermes:native-artifacts` into `pnpm check`, packaging parity, and
  review-readiness.
- Updated README, Hermes client/install docs, architecture, migration parity,
  test coverage parity, packaging/action parity, runtime decision ledger,
  research notes, review summary, and context board to record that Hermes
  native artifacts are snapshot-guarded but not ported.
- Kept the Hermes provider scaffold review-only: live API calls, old provider
  runtime modules, OAuth/wiki/formatting/update behavior, and banner asset copy
  remain deferred until explicitly accepted.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Rechecked the old Hermes repo recursive tree at
  `70d5d8951cf417dce0cebf159abaae330defde96`:
  https://api.github.com/repos/aristoapp/hermes-membase/git/trees/main?recursive=1
- Rechecked old Hermes package metadata:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/pyproject.toml
- Rechecked old Hermes publish workflow:
  https://raw.githubusercontent.com/aristoapp/hermes-membase/main/.github/workflows/publish.yml

Verification:

- Baseline `pnpm check` passed before edits.
- `pnpm hermes:native-artifacts` passed.
- `pnpm packaging-action-parity` passed.
- `pnpm review-readiness` passed.
- `git diff --check` passed.
- Final `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, packaging/action parity, version parity, Claude plugin parity,
  Claude native artifact snapshot, Cursor HTTP transport parity, Cursor native
  artifact snapshot, Hermes Python parity, Hermes native artifact snapshot,
  OpenClaw native artifact snapshot, OpenClaw native parity, secret-hygiene
  scan for 94 files, public-surface guard, and review-readiness guard for
  34 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.

Next step:

- Continue with explicitly accepted runtime or artifact parity only: rewrite
  and port Claude commands/hooks/skills, Cursor rules/skills/assets, Hermes
  live provider behavior, or OpenClaw hooks/tools only after review accepts
  the corresponding behavior.

## 2026-06-29 07:51 UTC

- Read required repo state: `README.md`, `PLAN.md`, `RUN_LOG.md`,
  `docs/architecture.md`, automation memory status, and `git status`.
- Chose the next safe review-hardening step from the post-20 queue:
  normalize package and manifest versioning across review surfaces without
  choosing a release tag, publishing packages, or porting deferred client-native
  behavior.
- Added `scripts/check-version-parity.mjs`, which verifies that the root,
  shared package, client package, Claude/Cursor plugin manifest, Hermes
  Python/YAML package metadata, and MCP `MEMBASE_CLIENT_VERSION` examples all
  stay synchronized to the current review version.
- Wired `pnpm version-parity` into `pnpm check` and
  `scripts/check-review-readiness.mjs`.
- Updated README, PLAN, architecture, migration parity, test coverage parity,
  packaging/action parity, review summary, smoke docs, and context board to
  record version parity as a local non-publishing guard.
- Kept OpenClaw native plugin manifests without a version field until ownership
  of that host-specific manifest field is accepted.
- No GitHub, Linear, marketplace, publish, merge, old-repo deprecation, live
  MCP smoke, global install, or external mutation action was performed in this
  run.

Research/evidence:

- Used local source-of-truth and review files for this safe hardening step:
  `PLAN.md`, `docs/migration-parity.md`, `docs/packaging-action-parity.md`,
  package manifests, committed client manifests, Hermes Python metadata, and
  committed MCP examples.
- No new OSS lookup was needed because this run guarded a local pending
  checklist item rather than changing runtime behavior or host integration
  shape.

Verification:

- `pnpm version-parity` passed.
- Final `pnpm check` passed: generated artifacts, shared core contract guard,
  dry-run smoke harness for 4 clients and 8 declared commands, live-smoke
  preflight, packaging/action parity, version parity, Claude plugin parity,
  Claude native artifact snapshot, Cursor HTTP transport parity, Cursor native
  artifact snapshot, Hermes Python parity, OpenClaw native artifact snapshot,
  OpenClaw native parity, secret-hygiene scan for 92 files, public-surface
  guard, and review-readiness guard for 33 shared files and 4 clients.
- `pnpm smoke:execute` passed: the smoke harness executed the 8
  adapter-declared local commands.
- `git diff --check` passed.

Next step:

- Continue with explicitly accepted runtime or artifact parity only: rewrite
  and port OpenClaw hooks/tools, Claude commands/hooks/skills, or Cursor
  rules/skills/assets after review, or implement Hermes live API behavior after
  package/runtime ownership is accepted.

## 2026-06-30 (interactive) — Finalize host/auth migration to membase.so, no user API key

- Took over the in-progress host/auth migration (decision: finalize to reality).
  Reconciled with the automation's remote base first; this work is on top of
  origin/main (96d676d), not the earlier stale local base.
- Finalized the connector model across all four clients:
  - Host `api.membase.com` -> `api.membase.so`; MCP host `mcp.membase.so`.
  - Removed the `@membase/mcp-server` placeholder and the `MEMBASE_API_KEY`
    env-injection model. No client uses a user-supplied API key.
  - Claude: bundled stdio server with env `{ MEMBASE_CLAUDE_PLUGIN: "1" }` only.
  - Cursor/Hermes/OpenClaw: remote HTTP MCP `https://mcp.membase.so/mcp` (OAuth /
    native-runtime primary). OpenClaw config schema switched to OAuth fields.
  - `packages/core`: `createMcpConfigDocument` no longer injects host/key/client
    env; default base URL is membase.so.
- Updated the decision ledger D2/D3/D6 to "Finalized" and brought every
  enforcing checker in line with the finalized model: check-core-contract,
  check-claude-plugin-parity, check-version-parity (dropped mcp client-version
  env), check-openclaw-native-parity (OAuth, no apiKeyEnv),
  check-cursor-transport-parity, check-runtime-decision-ledger,
  smoke/client-smoke.mjs, smoke/live-smoke-preflight.mjs, check-review-readiness.
- Rewrote install docs (claude/cursor/hermes/openclaw) and security.md to the
  OAuth / bundled-server / no-API-key model; fixed marketplace-assets homepage
  and the Hermes Python provider default host.
- Fixed scripts/check-public-surface.sh to fall back to grep when ripgrep is
  absent (it previously passed vacuously). Added scripts/regen-artifacts.mjs and
  a `pnpm generate` script.

Verification:

- `pnpm check` passed (all ~20 sub-checks, including the now-active
  public-surface scan and 16 generated artifacts).
- `pnpm smoke:execute` passed (4 clients, 8 commands).

Next step:

- Remaining launch work is unchanged: port outstanding marketplace assets, make
  the repo public, then execute old-repo deprecation (deferred per the user).

## 2026-07-05 (interactive) — Track assignment: Group E owned by the Cursor session

- ADR 0003 Group E (E1 descriptor mechanism + cursor/codex migration, E2
  remaining documented agents) is being implemented in an interactive Cursor
  session on branch `feature/group-e1-agent-descriptors`. Scheduled automation
  runs must NOT pick up Group E work; continue with Group D (D2 golden-vector
  wiring for Hermes, D3 host adapters) or docs/launch tasks instead.
- Priority adjustment accepted from review: the OpenClaw capture-path secret
  redaction gap (recorded in ADR 0002 D1 slice 1 notes) is a security gap in a
  deployed runtime, not cleanup. It is pulled forward: reconcile OpenClaw
  capture onto the capture-core sanitize right after (or parallel to) E1,
  before E2 coverage expansion.
- The scheduled loop reads `automation/codex-prompt.md` from the iCloud working
  copy at run time, not from `main` until that copy is pulled. Update both the
  GitHub repo and the iCloud checkout before re-enabling the loop.
