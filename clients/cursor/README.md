# Membase for Cursor

Connect [Membase](https://membase.so) persistent memory to
[Cursor](https://cursor.com).

Cursor connects to Membase over a **remote HTTP MCP server** with OAuth. There
is no API key in your config — you authorize on first use.

## Install

See the full guide: **[docs/install/cursor.md](../../docs/install/cursor.md)**.

The MCP config points at the hosted Membase MCP endpoint:

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

## Capabilities

Cursor reaches the hosted Membase MCP tools:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` ·
`update_wiki` · `delete_wiki` · `get_current_date`

`skills/` adds guided flows (memory search/save, wiki, dream, handoff),
`rules/membase.mdc` keeps memory use proactive, and `hooks/hooks.json` +
`runtime/` ship an optional, self-contained hooks adapter (`cursor-hook.mjs`
delegating to the bundled `hook.cjs`, a committed copy of the shared stdio
runtime in `packages/stdio-runtime`). No Membase server internals are exposed.

## For contributors

```bash
pnpm --filter @membase/client-cursor typecheck
pnpm cursor:transport-parity   # ensures the HTTP MCP endpoint stays the primary transport
pnpm public-surface            # lints the public API surface
```

Plugin metadata lives in `.cursor-plugin/plugin.json` and the MCP config in
`mcp.json`. Both are generated — edit the adapter in `src/index.ts` and run
`pnpm generate` (a root script) rather than hand-editing them. Run the hook
adapter tests with `node --test clients/cursor/runtime/` (the tests stub the
hook bundle; the committed `runtime/hook.cjs` itself is rebuilt via
`cd packages/stdio-runtime && bun run build`).
