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
