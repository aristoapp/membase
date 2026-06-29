# Hermes Agent Install

This guide covers the review-ready Hermes Agent connector flow for the
integrated Membase Plugin/MCP repo. It documents local install artifacts only;
it does not publish a package, mutate a Hermes installation, or deprecate the
old Hermes repo.

## Prerequisites

- Node.js 20 or newer for MCP server launch examples.
- Python 3.11 or newer for the existing Hermes native plugin package.
- `pnpm install` run at the repo root.
- A Membase API key available as `MEMBASE_API_KEY` in the shell or Hermes
  environment when using the MCP config path.

## Build And Sync Check

```bash
pnpm --filter @membase/client-hermes build
pnpm generated-artifacts
pnpm hermes:python-parity
pnpm hermes:native-artifacts
```

`pnpm generated-artifacts` verifies that the adapter output still matches
`clients/hermes/plugin/plugin.yaml`, `manifests/hermes/plugin.yaml`, and
`manifests/hermes/mcp.json`.
`pnpm hermes:python-parity` verifies the Hermes Python package review scaffold,
console script entrypoints, native YAML package data, Python syntax, provider
import/register behavior, and non-publishing boundary.
`pnpm hermes:native-artifacts` verifies
`clients/hermes/native-artifacts.json`, the review-only inventory of old Hermes
provider, capture, CLI, OAuth, wiki, formatting, asset, update-check, and test
evidence before any live behavior is ported.

## Native Plugin Metadata

Hermes plugin metadata lives in `clients/hermes/plugin/plugin.yaml`. The root
copy in `manifests/hermes/plugin.yaml` is the reviewable launch artifact.

The current manifest keeps the existing `hermes-membase` Python package as the
runtime dependency while migration parity is still being checked.
The local review scaffold for that package shape lives under
`clients/hermes/python/`; it is not a publishable release artifact. The
scaffold includes an importable `MembaseMemoryProvider` and native plugin
`register(ctx)` shim so Hermes can load the provider boundary in local review
without calling the Membase API.

For local review, keep the native metadata at the plugin metadata path expected
by the Hermes package. Do not move MCP server configuration into
`plugin.yaml`; keep MCP server entries in the user's Hermes config.

## MCP Config Translation

Use `manifests/hermes/mcp.json` as the canonical local MCP example for this
repo. Hermes stores MCP servers under `mcp_servers` in `~/.hermes/config.yaml`,
so the JSON example maps to this YAML shape:

```yaml
mcp_servers:
  membase:
    command: "npx"
    args: ["-y", "@membase/mcp-server"]
    env:
      MEMBASE_API_BASE_URL: "https://api.membase.com"
      MEMBASE_API_KEY: "${MEMBASE_API_KEY}"
      MEMBASE_CLIENT_ID: "hermes"
      MEMBASE_CLIENT_NAME: "Hermes Agent"
      MEMBASE_CLIENT_VERSION: "0.0.0"
```

Do not paste raw API keys into the config file. Keep `MEMBASE_API_KEY` as an
environment reference and set the real value in the shell or Hermes runtime
environment:

```bash
export MEMBASE_API_KEY="<membase-api-key>"
export MEMBASE_API_BASE_URL="https://api.membase.com"
```

If Hermes later supports both the native Python package path and the shared MCP
server path, treat `manifests/hermes/plugin.yaml` as native plugin metadata and
`manifests/hermes/mcp.json` as the MCP server config source. Do not duplicate
secret values between them.

## Local Verification

```bash
pnpm check
pnpm smoke:execute
```

`pnpm check` typechecks the adapter, verifies generated artifacts, runs the
dry-run smoke harness, runs the live-smoke preflight, checks Hermes Python
package parity, checks the Hermes native artifact snapshot, scans for raw
secret-looking values, and checks the public connector surface.
`pnpm smoke:execute` additionally runs the adapter-declared local commands
without publishing, installing the Hermes package, or calling the Membase API.

Host-level Hermes runtime API checks remain pending until the Python
package/native provider path is accepted for live connector calls against
test-only credentials.

## Review Checklist

- `clients/hermes/plugin/plugin.yaml` has connector capability copy only.
- `clients/hermes/python/src/hermes_membase/provider.py` imports locally and
  exposes only remember, search, task context, and forget tool schemas.
- `clients/hermes/native-artifacts.json` is present and
  `pnpm hermes:native-artifacts` passes before any old provider, capture,
  OAuth, wiki, formatting, asset, update-check, or test behavior is ported.
- `manifests/hermes/mcp.json` contains `mcpServers.membase`.
- The translated Hermes config uses `mcp_servers.membase` with `command`,
  `args`, and `env`.
- `MEMBASE_API_KEY` is an environment reference, not a raw token.
- No public artifact describes Membase storage, graph, embedding, ranking, or
  private memory-engine details.

## References

- Hermes Agent MCP guide:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md
- Hermes optional MCP manifest example:
  https://github.com/NousResearch/hermes-agent/blob/main/optional-mcps/linear/manifest.yaml
- Existing Hermes Membase repo:
  https://github.com/aristoapp/hermes-membase
