# Membase for Claude Code

Connect [Membase](https://membase.so) persistent memory to
[Claude Code](https://docs.anthropic.com/en/docs/claude-code).

This connector ships as a Claude Code **plugin** with a bundled, plugin-local
(stdio) MCP server. The plugin manages login through Membase's own OAuth flow,
so there is **no API key** to place in your config.

## Install

See the full guide: **[docs/install/claude.md](../../docs/install/claude.md)**.

The plugin-local MCP config looks like this:

```json
{
  "mcpServers": {
    "membase": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs"],
      "env": { "MEMBASE_CLAUDE_PLUGIN": "1" }
    }
  }
}
```

The bundled server handles login and Membase API access. The API endpoint
defaults to `https://api.membase.so` and can be overridden via the plugin's
`apiUrl` user config.

## Capabilities

Through the shared Membase Context API, the connector exposes: `remember`,
`search`, `getContext`, and `deleteOrForget`. No internal Membase memory
details are exposed.

## For contributors

```bash
pnpm --filter @membase/client-claude typecheck
pnpm claude:plugin-parity     # validates the plugin manifest with the Claude Code CLI
pnpm public-surface           # ensures no internal Membase terms leak
```

Plugin metadata lives in `.claude-plugin/plugin.json`; the plugin-local MCP
config lives in `.mcp.json`. Both are generated — edit the adapter in
`src/index.ts` and run `pnpm generate` rather than hand-editing them.
