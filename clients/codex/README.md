# Membase for Codex CLI

Connect [Membase](https://membase.so) persistent memory to the
[Codex CLI](https://developers.openai.com/codex/cli).

Codex supports remote streamable-HTTP MCP servers, so this connector points
Codex directly at the hosted Membase MCP endpoint. Auth is handled by
Codex-managed OAuth (`codex mcp login membase`). An optional local hooks
runtime (`runtime/hooks.json`) adds auto-capture, recall, and handoff
injection on top.

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

Codex reaches the hosted Membase MCP tools:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` ·
`update_wiki` · `delete_wiki` · `get_current_date`

`runtime/prompts/` adds `/dream` (flush the local capture spool) and
`/handoff` (store/pick up a session-state summary); `runtime/hooks.json` is a
template that wires optional auto-capture and recall through the shared stdio
runtime bundled with the Claude client. Nothing about Membase's internal
memory engine is exposed.

## For contributors

Run from the repo root after `pnpm install`:

```bash
pnpm --filter @membase/client-codex typecheck
pnpm generated-artifacts   # keeps adapter output in sync with committed manifests
pnpm public-surface        # lints the public API surface
```

Plugin metadata lives in `.codex-plugin/plugin.json` and the MCP config in
`.mcp.json`. Both are generated — edit the adapter in `src/index.ts` and run
`pnpm generate` (a root script) rather than hand-editing them.
