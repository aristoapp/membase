# Connector Consolidation — Execution Plan (Group A: Claude, Cursor, Codex)

Goal: deprecate the standalone connector repos and make `membase-plugin-mcp` the
single home for all connectors. This plan covers **Group A — the MCP-host
connectors (Claude, Cursor, Codex)**; Group B (OpenClaw, Hermes — embedded
runtimes) is a later phase.

Strategy: **hybrid = shared-core + thin per-client adapter/shim** (validated
against reference repos `continue`, `cody`, `vercel-ai`). Clients never
reimplement business logic; each is reduced to config/manifest generation over
`packages/core` + `packages/connector-sdk`.

## Why Group A is easy (verified 2026-07-03)

Group A connectors are **MCP hosts** — the editor/CLI reads an MCP config and
connects to the live MCP server; the memory runtime (remember/search/context/
forget) is provided by the server, not the connector. So "consolidation" here is
mostly **manifest + MCP-config generation**, which the adapters already do.

Same across all three:
- A plugin manifest (`.claude-plugin` / `.cursor-plugin` / `.codex-plugin`,
  shared fields: name/version/description/author/homepage/repository/license/keywords).
- Declare an MCP server via generated config.
- The `ClientAdapter` pattern (`generateManifest` + `generateMcpConfig` +
  `smokeTests`) in `clients/<id>/src/index.ts`.

Differences (the only real per-client variance):
- **Transport:** Cursor + Codex = remote HTTP (`https://mcp.membase.so/mcp`);
  Claude = plugin-local **stdio** bundled server (`scripts/mcp-server.cjs`).
- **Config file/format:** Claude/Cursor JSON; Codex also supports TOML
  (`~/.codex/config.toml` `[mcp_servers.membase]`), and a `.codex-plugin` that
  bundles a `.mcp.json`.
- **Bundled extras:** Claude bundles commands/hooks/skills/agents + stdio server;
  Cursor bundles rules/skills/logo; Codex (new) bundles nothing but config.

Decision (stdio server): **keep Claude's bundled stdio MCP server as
Claude-specific (option ㄱ).** Cursor and Codex use remote HTTP, so there is no
shared-runtime need in Group A. Revisit only if a second client needs stdio.

## Scope of this plan

IN: Codex adapter (new), Cursor adapter (exists — finalize), Claude adapter
(exists — finalize config generation only; defer commands/hooks/skills porting),
generated-artifact checks + manifests for all three, e2e/smoke wiring, docs.

OUT (this phase): porting Claude commands/hooks/skills/agents runtime (D4 —
tracked, deferred); Group B runtime absorption into a shared core; archiving old
repos.

## Phases

### Phase 1 — Codex adapter (new connector) ← START HERE
The cleanest first slice: purely additive, no runtime, mirrors Cursor (remote HTTP).
1. `clients/codex/` package `@membase/client-codex` (mirror `clients/cursor` structure).
2. `src/index.ts`: `codexAdapter` = defineAdapter with:
   - `generateCodexPluginManifest` → `.codex-plugin/plugin.json` (name/version/
     description/author/homepage/repository/license/keywords + `mcpServers`
     pointing to `.mcp.json`).
   - `generateCodexMcpConfig` → `createHttpMcpConfigDocument("membase", { url: "https://mcp.membase.so/mcp" })`.
   - `generateCodexArtifacts` (plugin + mcp).
   - `smokeTests` (typecheck + public-surface).
3. Commit generated artifacts: `clients/codex/.codex-plugin/plugin.json`,
   `clients/codex/.mcp.json`, `manifests/codex/{plugin.json,mcp.json}`.
4. Register `codex` in `scripts/check-generated-artifacts.mjs` adapterSpecs.
5. `manifests/codex/` + install doc `docs/install/codex.md`.
6. tsconfig + package.json wired into workspace (pnpm).

### Phase 2 — Finalize Cursor + Claude adapters
- Cursor: already complete (HTTP). Verify generated artifacts match committed;
  add anything missing (it's the template for Codex).
- Claude: keep stdio config generation as-is; ensure `generateClaudeArtifacts`
  + committed artifacts + parity gate pass. Do NOT port commands/hooks/skills
  yet (deferred, D4) — leave `native-artifacts.json` as the tracked inventory.

### Phase 3 — Verification wiring
- `pnpm check` (typecheck + generated-artifacts + smoke dry-run + secret hygiene
  + public-surface) green with codex added.
- Extend the e2e tiers if needed so Codex's config example is validated like the
  others (Tier 1 already checks committed client configs against the live MCP
  server; add codex config to that set).

### Phase 4 — Docs + deprecation prep (no repo mutation)
- Install doc for codex; update `docs/migration-parity.md` client matrix (codex
  row) and `docs/deprecation-plan.md` readiness note.
- Do NOT archive/notice old repos yet.

## Guardrails
- Every phase ends with `pnpm check` green.
- No secrets in committed configs (public-surface + secret-hygiene gates).
- Additive first (Codex) before touching existing adapters.
- Keep commits small and per-phase; branch `feature/consolidate-group-a`.

## Open items (tracked, not blocking Phase 1)
- Claude commands/hooks/skills/agents runtime porting (D4) — deferred.
- Codex: optional stdio-bridge fallback (`@membase/mcp-bridge`) given upstream
  streamable-HTTP issues — defer unless needed.
- Group B (OpenClaw/Hermes) runtime absorption into shared core — next phase;
  the hermes headless-auth (aristoapp/hermes-membase#2) re-lands there.
