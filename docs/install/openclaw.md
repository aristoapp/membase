# OpenClaw Install

This guide covers the review-ready OpenClaw connector flow for the integrated
Membase Plugin/MCP repo. It documents local install artifacts only; it does not
publish a package, mutate an OpenClaw installation, or deprecate the old
OpenClaw repo.

## Prerequisites

- An OpenClaw checkout or installation with the `openclaw` CLI available.
- `pnpm install` run at the repo root for the connector workspace checks.
- A Membase account. The OpenClaw plugin authenticates through an OAuth flow
  (access/refresh tokens); there is no user-supplied API key.

## Build And Sync Check

```bash
pnpm --filter @membase/client-openclaw build
pnpm generated-artifacts
```

`pnpm generated-artifacts` verifies that the adapter output still matches
`clients/openclaw/openclaw.plugin.json`, `clients/openclaw/mcp.json`,
`manifests/openclaw/plugin.json`, and `manifests/openclaw/mcp.json`.

## Native Plugin Manifest

OpenClaw plugin metadata lives in `clients/openclaw/openclaw.plugin.json`. The
copy in `manifests/openclaw/plugin.json` is the reviewable launch artifact.

The manifest follows OpenClaw's plugin shape: a canonical plugin `id`, optional
exclusive `kind`, skill directory references, UI hints, and strict
`configSchema` validation.

`clients/openclaw/package.json` also declares the native OpenClaw extension
entrypoint:

```json
{
  "openclaw": {
    "extensions": ["./dist/index.js"]
  }
}
```

`pnpm openclaw:native-parity` builds that entrypoint and imports the default
extension export locally. The entrypoint is a review-safe connector boundary;
old hook, command, tool, and skill behavior still needs explicit migration
before live OpenClaw runtime exercise.

`clients/openclaw/native-artifacts.json` records the old OpenClaw command,
hook, tool, config, update-check, and runtime-test files as review-only
evidence. `pnpm openclaw:native-artifacts` verifies that snapshot and prevents
old runtime directories from being copied before a migration decision accepts
them.

## Local Plugin Install

For a local checkout, install the OpenClaw connector package path and restart
the gateway:

```bash
openclaw plugins install --link ./clients/openclaw
openclaw plugins enable openclaw-membase
openclaw gateway restart
openclaw plugins inspect openclaw-membase --runtime --json
```

Configure plugin-specific settings under `plugins.entries.openclaw-membase`.
Keep OAuth tokens outside committed config — prefer `tokenFile` for the native
OAuth token cache.

```json
{
  "plugins": {
    "entries": {
      "openclaw-membase": {
        "enabled": true,
        "config": {
          "apiUrl": "https://api.membase.so",
          "tokenFile": "~/.openclaw/credentials/openclaw-membase.json",
          "autoRecall": false,
          "autoWikiRecall": false,
          "autoCapture": true,
          "maxRecallChars": 4000
        }
      }
    }
  }
}
```

The plugin completes its OAuth login on first use and caches tokens in the
`tokenFile`. Do not commit `accessToken` or `refreshToken` values.

## MCP Config

For setups that connect OpenClaw to the hosted Membase MCP server, use
`manifests/openclaw/mcp.json` as the canonical example. It points at the remote
Membase MCP endpoint:

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp",
      "headers": {}
    }
  }
}
```

Keep the native plugin manifest and the MCP config separate. The manifest
describes OpenClaw plugin control-plane metadata and local settings; the MCP
config describes the remote connector server endpoint.

## Local Verification

```bash
pnpm check
pnpm openclaw:native-artifacts
pnpm smoke:execute
```

`pnpm check` typechecks the adapter, verifies generated artifacts, runs the
dry-run smoke harness, scans for raw secret-looking values, and checks the
public connector surface. `pnpm smoke:execute` additionally runs the
adapter-declared local commands without publishing, installing a global
OpenClaw plugin, or calling the Membase API.

Host-level OpenClaw runtime checks remain pending until hook/tool migration
parity and live test inputs are accepted. The native package entrypoint is
checked locally; the remote HTTP MCP config is the connector example.

## Review Checklist

- `clients/openclaw/openclaw.plugin.json` has connector capability copy only.
- `clients/openclaw/mcp.json` and `manifests/openclaw/mcp.json` contain
  `mcpServers.membase` with the remote `url` and an empty `headers` object.
- `clients/openclaw/package.json` declares `openclaw.extensions` for
  `./dist/index.js`.
- `clients/openclaw/native-artifacts.json` is present and
  `pnpm openclaw:native-artifacts` passes before any old command, hook, tool,
  or skill behavior is ported.
- Native OpenClaw settings point at a token file, not a committed token value.
- No raw token or API key appears in any committed config; authentication is the
  OAuth flow.
- No public artifact describes Membase storage, graph, embedding, ranking, or
  private memory-engine details.

## References

- OpenClaw plugin docs: https://docs.openclaw.ai/plugins
- OpenClaw manifest docs: https://docs.openclaw.ai/plugins/manifest
- Existing OpenClaw Membase repo:
  https://github.com/aristoapp/openclaw-membase
