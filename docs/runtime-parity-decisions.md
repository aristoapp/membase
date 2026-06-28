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
| D1 | Final public repository URL and release path | Review docs use `https://github.com/aristoapp/membase-plugin-mcp` as the proposed target, but no external mutation has happened. | Confirm final repo URL, release/tag naming, and whether first review happens from root or a release bundle. | `README.md`, `docs/marketplace-assets.md`, `docs/deprecation-plan.md`, old repo notices. | Pending Jaehwan decision. |
| D2 | Shared MCP server command or package path | Generated examples currently use `npx -y @membase/mcp-server` as the placeholder command. | Confirm package name, local command, version pinning, and whether live smoke may install or execute it locally. | `packages/core`, `clients/*`, `manifests/*/mcp.json`, `docs/install/*.md`, `smoke/*`. | Pending implementation source. |
| D3 | Per-client transport precedence | Cursor uses local stdio MCP config syntax; other clients use the shared MCP config document. Old repos may also imply remote URL compatibility. | Decide for each client whether first launch supports remote MCP URL, local stdio package, or both with documented precedence. | `clients/*`, `manifests/*`, `docs/install/*.md`, marketplace copy, smoke tests. | Pending compatibility decision. |
| D4 | Client-native runtime parity scope | Adapter skeletons cover manifests/config and smoke command declarations; old client command, hook, provider, rule, skill, and tool behavior is not silently ported. | Decide per client which legacy runtime behaviors move into this repo, stay legacy for the first launch, or become follow-up work. | `clients/*`, `docs/migration-parity.md`, `docs/test-coverage-parity.md`, future client-native tests. | Pending per-client acceptance. |
| D5 | Marketplace asset reuse | Old Cursor logo and Hermes banner are review candidates only; generated manifests do not reference them. | Confirm asset ownership, design fit, file destination, and whether new assets are required. | `docs/marketplace-assets.md`, `clients/*/assets`, generated manifests, committed manifest copies. | Pending asset review. |
| D6 | Live client-to-MCP smoke gate | Dry-run and command-execution smoke pass locally; `docs/live-smoke-runbook.md` defines the future launch gate. | Confirm MCP server path, test credentials policy, test profile, cleanup behavior, and redacted logging format. | `smoke/*`, `docs/security.md`, `docs/live-smoke-runbook.md`, `docs/install/*.md`, CI or local check scripts. | Pending D2. |

## Per-Client Runtime Questions

| Client | Question before launch handoff | First safe default |
| --- | --- | --- |
| Claude Code | Should old commands, skills, agents, hooks, session-start behavior, project scoping, and manifest validation move into this repo? | Keep current adapter/config/docs as reviewable skeletons until each behavior is accepted into the public connector contract or marked legacy. |
| Cursor | Should old rules, skills, logo, changelog text, and remote MCP URL support be ported? | Keep local stdio config and connector-capability copy; port rules, skills, or assets only after review. |
| Hermes Agent | Should the old Python provider package remain the runtime, migrate here, or be replaced by MCP-only config? | Keep native plugin metadata and MCP config separated until package-path ownership is decided. |
| OpenClaw | Should native hooks, commands, tools, skills, config schema, and extension entrypoint be migrated now? | Keep native manifest placeholder and MCP config reviewable; defer hook/tool parity until auth and entrypoint decisions are accepted. |

## Verification Gate

Before any external launch, old repo notice, marketplace submission, or live
runtime handoff:

```bash
pnpm check
pnpm smoke:execute
```

If D2 and D6 are accepted, add live client-to-MCP smoke coverage that uses
explicit test credentials, creates tagged test data, cleans it up, and prints
only redacted diagnostics. Use `docs/live-smoke-runbook.md` as the implementation
contract.

## No External Mutations

This ledger is a review artifact only. It does not publish packages, open pull
requests, update Linear, submit marketplace listings, archive old repositories,
or change GitHub repository state.
