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

Through the shared Membase Context API, the connector exposes: `remember`,
`search`, `getContext`, and `deleteOrForget`. No internal Membase memory
details are exposed.

## For contributors

```bash
pnpm --filter @membase/client-hermes typecheck
pnpm hermes:python-parity   # validates the Python package + provider boundary
pnpm public-surface         # ensures no internal Membase terms leak
```

Run the Python test suite with:

```bash
pnpm hermes:test
```
