# OpenClaw Connector

OpenClaw adapter boundary for the integrated Membase Plugin/MCP repo.

This package owns the reviewable OpenClaw manifest shape, a shared MCP config
example, and smoke-test declarations. Runtime implementation parity with the
existing `aristoapp/openclaw-membase` repo is tracked separately in the
migration checklist.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter`.
- `openclaw.plugin.json` is the local OpenClaw manifest placeholder.
- `mcp.json` is the canonical local MCP config example.
- `../../manifests/openclaw/` contains the reviewable launch copies.

## Local Verification

```bash
pnpm --filter @membase/client-openclaw typecheck
pnpm public-surface
```
