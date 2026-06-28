# Hermes Agent Connector

Hermes Agent adapter boundary for Membase.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` boundary.
- `plugin/plugin.yaml` is the native Hermes plugin metadata placeholder.
- `mcp.json` is the Hermes-oriented MCP config example.
- `../../manifests/hermes/` contains the root reviewable manifest copies.
- `../../docs/install/hermes.md` documents local install and verification.

## Local Checks

```bash
pnpm --filter @membase/client-hermes typecheck
pnpm public-surface
```

The adapter only exposes connector capabilities: remember, search, task
context, and forget actions through the shared Membase Context API.
