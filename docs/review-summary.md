# Linear-Ready Summary

This document is the final review snapshot for the Linear project
`Plugin/MCP 통합 레포 출시`. It summarizes the integrated repo state without
repositioning the work as a new product direction.

Source-of-truth issues:

- `MEM-327`: Plugin/MCP integration repo architecture decision
- `MEM-328`: integrated repo scaffolding
- `MEM-329`: shared auth/install/MCP core and client manifest integration
- `MEM-330`: migration of Claude, Cursor, Hermes, and OpenClaw repos
- `MEM-331`: README, install docs, and marketplace assets
- `MEM-332`: old plugin repo deprecation and launch consolidation

## Current Readiness

The repo is ready for local review as the canonical public connector integration
surface for Membase:

- Architecture decision is accepted in
  `docs/adr/0001-integrated-connector-repo.md`.
- Workspace scaffolding exists for shared packages, four clients, docs,
  manifests, scripts, and smoke checks.
- `packages/core` owns endpoint, auth environment, MCP config generation,
  validation, and redacted diagnostics.
- `pnpm core:contract` now guards shared core config defaults, env references,
  MCP document shape, validation errors, and diagnostic redaction.
- `packages/connector-sdk` owns the public client adapter boundary.
- Claude, Cursor, Hermes, and OpenClaw each have adapter packages, manifest or
  config examples, install docs, and smoke command declarations.
- Existing client repos are inventoried in `docs/migration-parity.md` with
  explicit parity gaps instead of silent runtime assumptions.
- Old repo packaging and GitHub Action boundaries are mapped in
  `docs/packaging-action-parity.md`, with publishing paths kept disabled.
- Claude, Cursor, Hermes, and OpenClaw have local parity gates through
  `pnpm claude:plugin-parity`, `pnpm claude:native-artifacts`,
  `pnpm cursor:transport-parity`,
  `pnpm cursor:native-artifacts`, `pnpm hermes:python-parity`,
  `pnpm hermes:native-artifacts`, and
  `pnpm openclaw:native-artifacts`, and `pnpm openclaw:native-parity`.
- `pnpm version-parity` keeps package versions, public plugin manifest
  versions, Hermes Python/YAML package metadata, and MCP client-version
  examples synchronized while the actual release tag remains a launch decision.
- `pnpm runtime-decision-ledger` keeps the D1-D6 runtime and launch decision
  statuses explicit, including the blocked live-smoke state and non-mutating
  review boundary.
- `pnpm launch-handoff` keeps the accepted D1 public repository URL synchronized
  across marketplace, deprecation, and review handoff docs while the release tag
  or bundle path remains a launch decision.
- Claude native artifact snapshot evidence is guarded in
  `clients/claude/native-artifacts.json` without copying deferred commands,
  hooks, skills, agent, bundled runtime scripts, or session-start behavior into
  the integrated repo.
- Cursor native artifact snapshot evidence is guarded in
  `clients/cursor/native-artifacts.json` without copying deferred rules,
  skills, logo, or changelog content into the integrated repo.
- Hermes package parity now includes an importable provider/register boundary
  without enabling live API calls.
- Hermes native artifact snapshot evidence is guarded in
  `clients/hermes/native-artifacts.json` without copying deferred provider,
  capture, OAuth, wiki, formatting, asset, update-check, or runtime test
  behavior into the integrated repo.
- OpenClaw package metadata preserves the native extension entrypoint and the
  local parity gate imports the built entrypoint without publishing.
- OpenClaw native artifact snapshot evidence is guarded in
  `clients/openclaw/native-artifacts.json` without copying deferred commands,
  hooks, tools, config helpers, update checks, or runtime tests into the
  integrated repo.
- README, install docs, marketplace assets, deprecation planning, security, and
  test coverage parity are documented for review.
- Local verification is wired through `pnpm check` and `pnpm smoke:execute`.
- Live smoke readiness is guarded by `pnpm smoke:live:preflight` until D2/D3
  are accepted.

## Definition of Done Mapping

| Requirement | Evidence | Status |
| --- | --- | --- |
| Architecture decision exists and is defensible against OSS references. | `docs/adr/0001-integrated-connector-repo.md`, `docs/architecture.md`, `docs/research/oss-targets.md` | Ready for review. |
| Local repo has package/workspace/client/docs/smoke structure. | `package.json`, `pnpm-workspace.yaml`, `packages/*`, `clients/*`, `docs/*`, `smoke/*` | Ready for review. |
| Shared auth/install/MCP config core has concrete API and implementation path. | `packages/core/src/index.ts`, `packages/connector-sdk/src/index.ts`, `scripts/check-core-contract.mjs`, `docs/architecture.md` | Ready for review and guarded by local core contract checks. |
| Claude, Cursor, Hermes, and OpenClaw have adapter boundaries and install artifacts. | `clients/{claude,cursor,hermes,openclaw}`, `manifests/*`, `docs/install/*.md` | Ready for review. |
| Existing four repos are inventoried with migration parity checklist. | `docs/migration-parity.md`, `docs/test-coverage-parity.md` | Ready for review. |
| Old repo packaging/action parity and version/runtime decision metadata are mapped before runtime migration. | `docs/packaging-action-parity.md`, `docs/runtime-parity-decisions.md`, `scripts/check-packaging-action-parity.mjs`, `scripts/check-version-parity.mjs`, `scripts/check-runtime-decision-ledger.mjs`, `scripts/check-claude-plugin-parity.mjs`, `scripts/check-claude-native-artifacts.mjs`, `scripts/check-cursor-transport-parity.mjs`, `scripts/check-cursor-native-artifacts.mjs`, `scripts/check-hermes-python-parity.mjs`, `scripts/check-hermes-native-artifacts.mjs`, `scripts/check-openclaw-native-artifacts.mjs`, `scripts/check-openclaw-native-parity.mjs` | Guarded by local checks; version parity, runtime decision ledger parity, Claude plugin parity, Claude native artifact snapshot, Cursor HTTP transport parity, Cursor native artifact snapshot, Hermes Python/provider boundary parity, Hermes native artifact snapshot, OpenClaw native artifact snapshot, and OpenClaw native entrypoint parity are executable. |
| README and marketplace/deprecation plan are ready for review. | `README.md`, `docs/marketplace-assets.md`, `docs/deprecation-plan.md` | Ready for review. |
| Public connector APIs do not expose private Membase memory internals. | `scripts/check-public-surface.sh`, `scripts/check-secret-hygiene.mjs`, `docs/security.md` | Guarded by local checks. |

## Remaining Review Decisions

These are intentionally not hidden behind the adapter skeletons. The current
decision ledger is `docs/runtime-parity-decisions.md`.

- Keep the accepted public repository URL and decide the remaining release/tag path.
- Preserve and implement the remaining client-specific runtime paths: Claude
  plugin-local stdio and Cursor HTTP MCP are now preserved in generated config
  artifacts; Hermes provider import/register behavior is represented locally;
  OpenClaw native extension entrypoint is preserved in package metadata; Hermes
  live API behavior and OpenClaw hook/tool behavior remain pending.
- Decide which clients, if any, get secondary fallback transports after the
  primary path is preserved.
- Decide whether old Claude commands/hooks/skills, Cursor rules/skills, Hermes
  provider package behavior, and OpenClaw hooks/tools move into this repo or
  remain legacy for the first launch.
- Convert remaining old non-publishing package/action checks into local parity
  checks after each host runtime path can run without external mutations.
  Claude plugin validation, Cursor HTTP transport parity, Hermes Python/provider
  boundary parity, Hermes native artifact snapshot, OpenClaw native artifact snapshot, and OpenClaw native
  entrypoint parity are completed local gates; Claude native commands/hooks/
  skills, Cursor rules/skills/assets, Hermes live behavior, and OpenClaw commands/hooks/tools are
  snapshot-guarded but not ported.
- Decide whether old Cursor logo and Hermes banner assets are reused, replaced,
  or omitted.
- Add live client-to-MCP smoke only after the remaining runtime paths and
  explicit test credentials are accepted. The required launch-gate shape is
  captured in `docs/live-smoke-runbook.md`.

## Verification Gates

Before review or any launch handoff, run:

```bash
pnpm check
pnpm core:contract
pnpm smoke:execute
pnpm smoke:live:preflight
pnpm runtime-decision-ledger
pnpm launch-handoff
pnpm version-parity
pnpm claude:plugin-parity
pnpm claude:native-artifacts
pnpm cursor:transport-parity
pnpm cursor:native-artifacts
pnpm hermes:python-parity
pnpm hermes:native-artifacts
pnpm openclaw:native-artifacts
pnpm openclaw:native-parity
```

`pnpm check` covers generated artifacts, shared core contract checks, dry-run
smoke, live-smoke preflight, runtime decision ledger parity,
launch handoff consistency, packaging/action parity, version parity, Claude plugin parity, Claude native artifact snapshot, Cursor HTTP transport parity,
Cursor native artifact snapshot, Hermes Python parity, Hermes native artifact
snapshot, OpenClaw native artifact snapshot, OpenClaw native parity, secret
hygiene, public surface guarding, and review-readiness.
`pnpm smoke:execute` executes the adapter-declared local commands without
production credentials.

Latest local verification on 2026-06-29 08:49 UTC:

- `pnpm check` passed.
- `pnpm core:contract` passed.
- `pnpm smoke:execute` passed.
- `pnpm smoke:live:preflight` passed.
- `pnpm runtime-decision-ledger` passed.
- `pnpm launch-handoff` passed.
- `pnpm version-parity` passed.
- `pnpm claude:plugin-parity` passed.
- `pnpm claude:native-artifacts` passed.
- `pnpm cursor:transport-parity` passed.
- `pnpm cursor:native-artifacts` passed.
- `pnpm hermes:python-parity` passed.
- `pnpm hermes:native-artifacts` passed.
- `pnpm openclaw:native-artifacts` passed.
- `pnpm openclaw:native-parity` passed.

## No External Mutations

This repo loop has not published packages, submitted marketplace listings,
merged branches, updated Linear, or archived old repos. GitHub `origin/main`
was updated only after Jaehwan's explicit preference for verified automation
result pushes, as recorded in `RUN_LOG.md`; later runs must still avoid
unrequested external mutations. `docs/deprecation-plan.md` remains a
non-mutating plan until Jaehwan explicitly asks for old-repo changes.
