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
      "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/mcp-server.cjs"],
      "env": { "MEMBASE_CLAUDE_PLUGIN": "1" }
    }
  }
}
```

The bundled server handles login and Membase API access. The API endpoint
defaults to `https://api.membase.so` and can be overridden via the plugin's
`apiUrl` user config.

## Capabilities

The plugin's stdio MCP server registers the hosted tool set plus
plugin-managed extras:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` ·
`update_wiki` · `delete_wiki` · `get_current_date`

plus `store_handoff`, `login` / `logout` / `get_status` /
`set_project_config`, the `membase://profile|recent|project` resources, and
auto-capture/recall hooks. No Membase server internals are
exposed.

## For contributors

```bash
pnpm --filter @membase/client-claude typecheck
pnpm claude:plugin-parity     # validates the plugin manifest with the Claude Code CLI
pnpm public-surface           # lints the public API surface
```

Plugin metadata — including the inline plugin-local MCP config — lives in the
generated `.claude-plugin/plugin.json` (there is deliberately no root
`.mcp.json`: Claude Code would also read that as project-scope MCP config for
anyone opening this repo). Edit the adapter in `src/index.ts` and run
`pnpm generate` rather than hand-editing it.
