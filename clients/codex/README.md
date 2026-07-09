# Membase for Codex CLI

Connect [Membase](https://membase.so) persistent memory to the
[Codex CLI](https://developers.openai.com/codex/cli).

Codex supports remote streamable-HTTP MCP servers, so this connector points
Codex directly at the hosted Membase MCP endpoint — no local bridge. Auth is
handled by Codex-managed OAuth (`codex mcp login membase`).

## Install

See the full guide: **[docs/install/codex.md](../../docs/install/codex.md)**.

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
pnpm --filter @membase/client-codex typecheck
pnpm generated-artifacts   # keeps adapter output in sync with committed manifests
pnpm public-surface        # ensures no internal Membase terms leak
```

Plugin metadata lives in `.codex-plugin/plugin.json` and the MCP config in
`.mcp.json`. Both are generated — edit the adapter in `src/index.ts` and run
`pnpm generate` rather than hand-editing them.
