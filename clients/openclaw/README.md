# Membase for OpenClaw

Connect [Membase](https://membase.so) persistent memory to OpenClaw.

OpenClaw integrates through a **native plugin** (a TypeScript extension) plus an
MCP config. Auth uses Membase's OAuth flow; tokens live in a `tokenFile`
(written 0600), and legacy tokens found in `openclaw.json` are migrated out
on startup.

## Install

See the full guide: **[docs/install/openclaw.md](../../docs/install/openclaw.md)**.

## Package layout

- `runtime/` — the plugin implementation: nine `membase_*` tools (search,
  store, profile, forget, handoff, wiki add/search/update/delete), recall and
  capture hooks, the failure-path spool, and the `openclaw membase` CLI
  (including `dream`, which uploads captures that failed to sync).
- `src/index.ts` — the connector adapter and the packaged native extension
  entrypoint.
- `package.json` — declares `openclaw.extensions` for the built entrypoint at
  `./dist/index.js`.
- `openclaw.plugin.json` — the OpenClaw plugin manifest.
- `mcp.json` — the MCP config example.

Minimum supported OpenClaw version: see `peerDependencies` in
`runtime/package.json`.

## Capabilities

The runtime registers nine `membase_*` tools (see `runtime/openclaw.plugin.json`
`contracts.tools`): memory search/store/forget, profile, session handoff, and
wiki add/search/update/delete. No Membase server internals
are exposed.

## For contributors

```bash
pnpm --filter @membase/client-openclaw typecheck
pnpm --filter @membase/client-openclaw build
pnpm openclaw:native-parity   # typecheck + build gate; verifies the built entrypoint imports
pnpm public-surface           # lints the public API surface
```

Run the runtime tests with (requires [Bun](https://bun.sh)):

```bash
pnpm openclaw:runtime-test
```
