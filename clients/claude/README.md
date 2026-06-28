# Claude Code Connector

Claude Code adapter boundary for Membase.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` boundary.
- `.claude-plugin/plugin.json` is the canonical Claude plugin metadata.
- `../../manifests/claude/mcp.json` is the example MCP server config.
- `../../docs/install/claude.md` documents local install and verification.

## Local Checks

```bash
pnpm --filter @membase/client-claude typecheck
pnpm public-surface
```

The adapter only exposes connector capabilities: remember, search, task context,
and forget actions through the shared Membase Context API.
