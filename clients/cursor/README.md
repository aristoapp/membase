# Cursor Connector

Cursor adapter boundary for Membase.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` boundary.
- `.cursor-plugin/plugin.json` is the canonical Cursor plugin metadata.
- `mcp.json` is the plugin-local Cursor HTTP MCP config example.
- `../../manifests/cursor/mcp.json` is the root reviewable HTTP MCP config
  example.
- `clients/cursor/native-artifacts.json` is the review-only snapshot of old
  Cursor rules, skills, logo, and changelog evidence before any copy is ported.
- `../../docs/install/cursor.md` documents local install and verification.

## Local Checks

```bash
pnpm --filter @membase/client-cursor typecheck
pnpm cursor:transport-parity
pnpm cursor:native-artifacts
pnpm public-surface
```

The adapter only exposes connector capabilities: remember, search, task context,
and forget actions through the shared Membase Context API.

The Cursor MCP config preserves the old repo's HTTP MCP endpoint first. Local
stdio fallback should be added only after an explicit runtime decision.
`pnpm cursor:native-artifacts` keeps the old Cursor rules, skills, logo, and
changelog in a snapshot-only state until each artifact is rewritten or approved.

## Marketplace Asset Reuse

- Treat the old `aristoapp/cursor-membase` `assets/logo.svg` as the Cursor
  logo candidate.
- Do not add a `logo` field to generated metadata until the file is copied under
  `clients/cursor/assets/` and approved for reuse.
- After the logo is copied, update adapter-generated metadata and committed
  manifest copies together, then run `pnpm generated-artifacts`.
