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
- `packages/connector-sdk` owns the public client adapter boundary.
- Claude, Cursor, Hermes, and OpenClaw each have adapter packages, manifest or
  config examples, install docs, and smoke command declarations.
- Existing client repos are inventoried in `docs/migration-parity.md` with
  explicit parity gaps instead of silent runtime assumptions.
- README, install docs, marketplace assets, deprecation planning, security, and
  test coverage parity are documented for review.
- Local verification is wired through `pnpm check` and `pnpm smoke:execute`.

## Definition of Done Mapping

| Requirement | Evidence | Status |
| --- | --- | --- |
| Architecture decision exists and is defensible against OSS references. | `docs/adr/0001-integrated-connector-repo.md`, `docs/architecture.md`, `docs/research/oss-targets.md` | Ready for review. |
| Local repo has package/workspace/client/docs/smoke structure. | `package.json`, `pnpm-workspace.yaml`, `packages/*`, `clients/*`, `docs/*`, `smoke/*` | Ready for review. |
| Shared auth/install/MCP config core has concrete API and implementation path. | `packages/core/src/index.ts`, `packages/connector-sdk/src/index.ts`, `docs/architecture.md` | Ready for review. |
| Claude, Cursor, Hermes, and OpenClaw have adapter boundaries and install artifacts. | `clients/{claude,cursor,hermes,openclaw}`, `manifests/*`, `docs/install/*.md` | Ready for review. |
| Existing four repos are inventoried with migration parity checklist. | `docs/migration-parity.md`, `docs/test-coverage-parity.md` | Ready for review. |
| README and marketplace/deprecation plan are ready for review. | `README.md`, `docs/marketplace-assets.md`, `docs/deprecation-plan.md` | Ready for review. |
| Public connector APIs do not expose private Membase memory internals. | `scripts/check-public-surface.sh`, `scripts/check-secret-hygiene.mjs`, `docs/security.md` | Guarded by local checks. |

## Remaining Review Decisions

These are intentionally not hidden behind the adapter skeletons. The current
decision ledger is `docs/runtime-parity-decisions.md`.

- Confirm the final public repository URL and release/tag path.
- Confirm the shared MCP server package or local command path.
- Decide per-client transport precedence: remote MCP URL, local stdio package,
  or both.
- Decide whether old Claude commands/hooks/skills, Cursor rules/skills, Hermes
  provider package behavior, and OpenClaw hooks/tools move into this repo or
  remain legacy for the first launch.
- Decide whether old Cursor logo and Hermes banner assets are reused, replaced,
  or omitted.
- Add live client-to-MCP smoke only after a local MCP server path exists and can
  run with explicit test credentials. The required launch-gate shape is captured
  in `docs/live-smoke-runbook.md`.

## Verification Gates

Before review or any launch handoff, run:

```bash
pnpm check
pnpm smoke:execute
```

`pnpm check` covers generated artifacts, dry-run smoke, secret hygiene, public
surface guarding, and review-readiness. `pnpm smoke:execute` executes the
adapter-declared local commands without production credentials.

Latest local verification on 2026-06-28 18:46 UTC:

- `pnpm check` passed.
- `pnpm smoke:execute` passed.

## No External Mutations

This repo loop has not published packages, submitted marketplace listings,
merged branches, updated Linear, archived old repos, or mutated GitHub repo
state. `docs/deprecation-plan.md` remains a non-mutating plan until Jaehwan
explicitly asks for external changes.
