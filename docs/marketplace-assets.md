# Marketplace Asset Checklist

This document tracks `MEM-331`: README, install docs, and marketplace assets
for the integrated Plugin/MCP repo. It is a launch-readiness checklist only; it
does not publish marketplace entries, mutate GitHub, or deprecate old repos.

## Rules

- Use the Linear project `Plugin/MCP 통합 레포 출시` as source of truth.
- Market the connector capability boundary, not Membase internals.
- Keep public copy focused on remember, search, task context, forget,
  diagnostics, install config, and MCP/client plugin compatibility.
- Do not reuse old copy that makes implementation-specific search, indexing,
  storage, or ranking claims.
- Do not add relative `logo` or `icon` manifest references until the asset file
  is committed in the same manifest tree and `pnpm generated-artifacts` passes.
- Do not publish, submit, or update marketplace listings from this repo loop.

## Shared Launch Copy

Short description:

> Connect AI coding agents to Membase context APIs through MCP and native client
> plugin configuration.

Long description:

> Membase Plugin/MCP provides reviewable connector packages for Claude Code,
> Cursor, Hermes Agent, and OpenClaw. Each connector uses shared auth,
> endpoint, manifest, and smoke-test primitives so agents can remember context,
> search saved context, request task context, and forget saved context without
> exposing Membase implementation details.

Keywords:

- membase
- mcp
- agent-memory
- context
- claude-code
- cursor
- hermes-agent
- openclaw

Support and ownership fields:

| Field | Proposed value | Status |
| --- | --- | --- |
| Owner name | Membase | Ready for review. |
| Support email | `support@aristo.so` | Ready for review; old Claude marketplace used `support@membase.so`. |
| Homepage | `https://membase.com` | Matches current generated manifests. |
| Repository | `https://github.com/aristoapp/membase-plugin-mcp` | Ready after repo publication path is confirmed. |
| License | MIT | Matches current generated manifests and old public repos. |

## Asset Inventory

| Client | Existing source evidence | Reuse decision | Blocker |
| --- | --- | --- | --- |
| Claude Code | `aristoapp/claude-membase` has `.claude-plugin/marketplace.json` and `plugin/.claude-plugin/plugin.json`. | Reuse the package-style metadata shape and owner/license fields after rewriting copy to the shared launch copy above. | Decide final marketplace source path for a monorepo package: repo root, `clients/claude`, or generated release bundle. |
| Cursor | `aristoapp/cursor-membase` has `.cursor-plugin/plugin.json` and `assets/logo.svg`. | Reuse the logo only after explicit design/legal review, then add it under `clients/cursor/assets/` and regenerate manifest output. Keep current connector-capability copy. | Current Cursor manifest intentionally has no `logo` field until the file is ported and checked. |
| Hermes Agent | `aristoapp/hermes-membase` has `hermes-membase-banner.png` and `src/membase_hermes/plugin/plugin.yaml`. | Treat the banner as an optional review asset. Keep native YAML metadata separate from MCP server config. | Decide whether Hermes runtime remains a Python package dependency or moves into this repo before final catalog packaging. |
| OpenClaw | `aristoapp/openclaw-membase` has `openclaw.plugin.json` and native extension metadata, but no obvious image asset in the repo tree. | Use the native manifest shape already represented in `clients/openclaw/openclaw.plugin.json`. Create or request a new image asset only if the target listing requires one. | Decide native extension entrypoint, auth model, and runtime parity before publishing OpenClaw listing copy. |

## Per-Client Checklist

### Claude Code

- [x] Generated connector metadata exists at
  `clients/claude/.claude-plugin/plugin.json`.
- [x] Reviewable manifest copy exists at `manifests/claude/plugin.json`.
- [x] Install guide exists at `docs/install/claude.md`.
- [ ] Draft Claude marketplace descriptor for the integrated repo.
- [ ] Decide final plugin source path for marketplace submission.
- [ ] Decide whether commands, skills, hooks, and plugin-root MCP config are
  included in the first integrated listing or deferred to runtime parity.
- [ ] Run `pnpm check` and `pnpm smoke:execute` before submission review.

### Cursor

- [x] Generated connector metadata exists at
  `clients/cursor/.cursor-plugin/plugin.json`.
- [x] Plugin-local MCP config exists at `clients/cursor/mcp.json`.
- [x] Reviewable manifest copies exist under `manifests/cursor/`.
- [x] Install guide exists at `docs/install/cursor.md`.
- [ ] Port `assets/logo.svg` only after review, then update adapter-generated
  manifest output and committed manifest copies together.
- [ ] Decide whether the marketplace listing advertises local stdio config,
  remote MCP config, or both with clear precedence.
- [ ] Rewrite any rules, skills, and changelog text around connector
  capabilities before porting.
- [ ] Run `pnpm generated-artifacts` after any `logo` or `icon` field is added.

### Hermes Agent

- [x] Native plugin YAML exists at `clients/hermes/plugin/plugin.yaml`.
- [x] MCP config example exists at `clients/hermes/mcp.json`.
- [x] Reviewable manifest copies exist under `manifests/hermes/`.
- [x] Install guide exists at `docs/install/hermes.md`.
- [ ] Decide whether to reference the old Python package, publish a new package,
  or keep Hermes MCP-only for the first integrated review.
- [ ] Decide whether `hermes-membase-banner.png` is reused, replaced, or omitted.
- [ ] Add catalog-specific metadata only after the runtime/package decision.
- [ ] Run local smoke checks without production credentials.

### OpenClaw

- [x] Native manifest exists at `clients/openclaw/openclaw.plugin.json`.
- [x] MCP config example exists at `clients/openclaw/mcp.json`.
- [x] Reviewable manifest copies exist under `manifests/openclaw/`.
- [x] Install guide exists at `docs/install/openclaw.md`.
- [ ] Decide native extension entrypoint parity versus MCP-only review config.
- [ ] Decide whether env-only API key config is enough for first listing review.
- [ ] Create or request a marketplace image only if OpenClaw listing rules
  require one.
- [ ] Run OpenClaw runtime inspection only after local install can be performed
  without publishing or production secrets.

## Verification Gate

Before any marketplace submission review, run:

```bash
pnpm check
pnpm smoke:execute
```

For asset changes specifically, `pnpm generated-artifacts` must pass after the
adapter output and committed manifest copies are updated. This catches relative
`logo` or `icon` paths that point to missing files.

## Evidence

- Claude old marketplace descriptor:
  https://github.com/aristoapp/claude-membase/blob/main/.claude-plugin/marketplace.json
- Cursor old plugin metadata and asset path:
  https://github.com/aristoapp/cursor-membase/blob/main/.cursor-plugin/plugin.json
- Hermes old banner and native plugin metadata:
  https://github.com/aristoapp/hermes-membase
- OpenClaw old native manifest:
  https://github.com/aristoapp/openclaw-membase/blob/main/openclaw.plugin.json
- PostHog compact plugin metadata reference:
  https://github.com/PostHog/ai-plugin
- Obra Superpowers separate marketplace/plugin metadata reference:
  https://github.com/obra/superpowers/tree/main/.claude-plugin
