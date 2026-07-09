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

Through the shared Membase Context API, the connector exposes: `remember`,
`search`, `getContext`, and `deleteOrForget`. No internal Membase memory
details are exposed.

## For contributors

```bash
pnpm --filter @membase/client-cursor typecheck
pnpm cursor:transport-parity   # ensures the HTTP MCP endpoint stays the primary transport
pnpm cursor:native-artifacts   # verifies clients/cursor/native-artifacts.json snapshot
pnpm public-surface            # ensures no internal Membase terms leak
```

Plugin metadata lives in `.cursor-plugin/plugin.json` and the MCP config in
`mcp.json`. Both are generated — edit the adapter in `src/index.ts` and run
`pnpm generate` rather than hand-editing them.
