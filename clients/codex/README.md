# Codex Connector

Codex CLI adapter boundary for Membase. This is a **new** connector — there is
no old standalone repo to migrate, so there is no native-artifacts snapshot.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` boundary.
- `.codex-plugin/plugin.json` is the canonical Codex plugin metadata; its
  `mcpServers` field references the bundled `.mcp.json`.
- `.mcp.json` is the plugin-local Codex HTTP MCP config example.
- `../../manifests/codex/mcp.json` is the root reviewable HTTP MCP config
  example.
- `../../docs/install/codex.md` documents local install and verification.

## Local Checks

```bash
pnpm --filter @membase/client-codex typecheck
pnpm generated-artifacts
pnpm public-surface
```

The adapter only exposes connector capabilities: remember, search, task context,
and forget actions through the shared Membase Context API.

Codex supports remote streamable-HTTP MCP servers, so the connector points Codex
directly at `https://mcp.membase.so/mcp` (no local stdio bridge). Auth is handled
by Codex-managed OAuth (`codex mcp login membase`). A stdio-bridge fallback would
only be added after an explicit runtime decision, if upstream streamable-HTTP
handling proves unreliable.

`pnpm generated-artifacts` keeps the adapter output in sync with the committed
`.codex-plugin/plugin.json`, `.mcp.json`, and `manifests/codex/*`.

## Marketplace Asset Reuse

Codex is a new connector with no old repo, so there are no legacy assets to
reuse. Do not add a `logo` or other asset field to generated metadata until an
asset file is committed under `clients/codex/assets/` and approved; then update
the adapter and committed manifests together and run `pnpm generated-artifacts`.
