# Membase for Hermes Agent

Connect [Membase](https://membase.so) persistent memory to Hermes Agent.

Hermes integrates through a **native Python provider** plus an MCP config. Auth
uses Membase's OAuth flow; configs reference environment variables, never raw
secrets.

## Install

See the full guide: **[docs/install/hermes.md](../../docs/install/hermes.md)**,
which includes notes on translating the MCP JSON example into Hermes'
`mcp_servers` YAML.

## Package layout

- `python/` — the Membase provider for Hermes (`membase_hermes`), exposing an
  importable provider/register boundary.
- `plugin/plugin.yaml` — native Hermes plugin metadata.
- `mcp.json` — Hermes-oriented MCP config example.

## Capabilities

The Python provider registers `membase_search`, `membase_get_current_date`,
`membase_store`, `membase_profile`, `membase_forget`, `membase_handoff`, and
the four wiki tools (`membase_add_wiki`, `membase_search_wiki`,
`membase_update_wiki`, `membase_delete_wiki`), plus prefetch recall and
auto-capture (conversation transcripts saved as wiki documents, with a disk
spool + `hermes-membase dream` for failed uploads). Wiki tools accept a
`project` filing location (`collection` stays as a legacy alias). No Membase
server internals are exposed.

## For contributors

```bash
pnpm --filter @membase/client-hermes typecheck
pnpm hermes:python-parity   # validates the Python package + provider boundary
pnpm public-surface         # lints the public API surface
```

Run the Python test suite with:

```bash
pnpm hermes:test
```
