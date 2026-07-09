# Membase for OpenClaw

Connect [Membase](https://membase.so) persistent memory to OpenClaw.

OpenClaw integrates through a **native plugin** (a TypeScript extension) plus an
MCP config. Auth uses Membase's OAuth flow; configs reference environment
variables, never raw secrets.

## Install

See the full guide: **[docs/install/openclaw.md](../../docs/install/openclaw.md)**.

## Package layout

- `src/index.ts` — implements the connector adapter and exports the native
  OpenClaw extension entrypoint.
- `package.json` — declares `openclaw.extensions` for the built entrypoint at
  `./dist/index.js`.
- `openclaw.plugin.json` — the OpenClaw plugin manifest.
- `mcp.json` — the MCP config example.

## Capabilities

Through the shared Membase Context API, the connector exposes: `remember`,
`search`, `getContext`, and `deleteOrForget`. No internal Membase memory
details are exposed.

## For contributors

```bash
pnpm --filter @membase/client-openclaw typecheck
pnpm --filter @membase/client-openclaw build
pnpm openclaw:native-parity   # typecheck + build gate; verifies the built entrypoint imports
pnpm public-surface           # ensures no internal Membase terms leak
```

Run the runtime tests with:

```bash
pnpm openclaw:runtime-test
```
