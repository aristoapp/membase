# OpenClaw Connector

OpenClaw adapter boundary for the integrated Membase Plugin/MCP repo.

This package owns the reviewable OpenClaw manifest shape, a native extension
entrypoint, a shared MCP config example, and smoke-test declarations. Runtime
hook/tool parity with the existing `aristoapp/openclaw-membase` repo is tracked
separately in the migration checklist.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` and exports the default
  native extension entrypoint used by OpenClaw.
- `package.json` declares `openclaw.extensions` for the built entrypoint at
  `./dist/index.js`.
- `native-artifacts.json` records the old OpenClaw command, hook, tool,
  config, update-check, and runtime-test evidence as review-only inventory.
- `openclaw.plugin.json` is the local OpenClaw manifest placeholder.
- `mcp.json` is the canonical local MCP config example.
- `../../manifests/openclaw/` contains the reviewable launch copies.

## Local Verification

```bash
pnpm --filter @membase/client-openclaw typecheck
pnpm --filter @membase/client-openclaw build
pnpm openclaw:native-artifacts
pnpm openclaw:native-parity
pnpm public-surface
```

`pnpm openclaw:native-artifacts` verifies
`clients/openclaw/native-artifacts.json`, keeps old OpenClaw runtime artifacts
uncopied, and keeps generated metadata free of premature command, hook, or tool
declarations.

`pnpm openclaw:native-parity` is the integrated, non-publishing parity gate for
the old OpenClaw `check-types` plus build workflow. It also verifies that the
local native manifest and package remain private review artifacts and that the
built extension entrypoint can be imported.

## Marketplace Asset Reuse

- No existing OpenClaw image asset is selected from the old
  `aristoapp/openclaw-membase` repo.
- Reuse the native manifest shape already represented in
  `openclaw.plugin.json`.
- If OpenClaw listing review requires an image, add it under
  `clients/openclaw/assets/`, update adapter-generated metadata and committed
  manifest copies together, then run `pnpm generated-artifacts`.
