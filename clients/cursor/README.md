# Cursor Connector

Cursor adapter boundary for Membase.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` boundary.
- `.cursor-plugin/plugin.json` is the canonical Cursor plugin metadata.
- `mcp.json` is the plugin-local Cursor MCP config example.
- `../../manifests/cursor/mcp.json` is the root reviewable MCP config example.
- `../../docs/install/cursor.md` documents local install and verification.

## Local Checks

```bash
pnpm --filter @membase/client-cursor typecheck
pnpm public-surface
```

The adapter only exposes connector capabilities: remember, search, task context,
and forget actions through the shared Membase Context API.
