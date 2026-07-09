# Secret Handling and Security

This document describes the security and secret-handling model for the Membase
connectors. It is intentionally scoped to public connector installation, MCP
configuration, diagnostics, and smoke testing.

## Security Boundary

Public connector code may expose:

- connector capability names: remember, search, task context, and forget
- endpoint and client identity configuration
- client manifest and MCP config generation
- install diagnostics and smoke-test status

Public connector code must not expose Membase's private storage, graph,
embedding, ranking, freshness, or governance implementation details.

## Secret Model

Membase clients do not use a user-supplied API key. Authentication is handled
by the client per transport, and no raw credential belongs in a committed
config or manifest:

| Client | Transport | Auth |
| --- | --- | --- |
| Cursor | Remote MCP URL (`https://mcp.membase.so/mcp`) | In-client OAuth browser flow; no committed token. |
| Codex CLI | Remote MCP URL (`https://mcp.membase.so/mcp`) | Codex-managed OAuth (`codex mcp login membase`). |
| Claude Code | Hosted HTTP MCP or the bundled stdio server (`node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`) | Plugin-managed login (`/membase:login`). |
| Hermes Agent | Native `hermes-membase` pip package (or remote MCP URL) | OAuth flow. |
| OpenClaw | Native plugin (or remote MCP URL) | OAuth access/refresh tokens cached in a `tokenFile` (default `~/.openclaw/membase/tokens.json`, written 0600). |

Supported public configuration values:

| Value | Required | Purpose |
| --- | --- | --- |
| `apiUrl` / `MEMBASE_API_BASE_URL` | No | API endpoint override. Defaults to `https://api.membase.so`. |
| `MEMBASE_PROFILE` | No | Optional free-form label a client can attach to scope its runtime config. |
| OAuth tokens (`accessToken`, `refreshToken`, `tokenFile`) | Client-managed | Held by the client runtime; never committed. |

## Local Setup

Real credentials are obtained through each client's OAuth or plugin login flow,
not exported as shell variables. Only the optional endpoint override is a plain
value:

```bash
export MEMBASE_API_BASE_URL="https://api.membase.so"
```

Local env files and OAuth token caches are ignored by this repo. Only
`.env.example`-style placeholder files may be committed, and they must not
contain real credentials.

## Redaction Guarantees

`packages/capture-core` owns the shared capture-path redaction (best-effort by
design — key-name and token-shape heuristics, golden-vector-bound across the
TS and Python runtimes):

- secret assignments (`API_KEY`/`TOKEN`/`SECRET`/`PASSWORD`-style keys) and
  common token shapes are redacted before a capture is buffered, spooled to
  disk, or uploaded
- generated MCP config documents carry no embedded credentials: remote-URL
  configs use empty headers, and the bundled Claude server config carries only
  a non-secret plugin flag (`pnpm core:contract` validates this at the shared
  core boundary)
- `smoke/client-smoke.mjs` injects a fake sentinel secret and fails if adapter
  diagnostics or MCP config include that raw value
- `scripts/check-secret-hygiene.mjs` scans committed artifacts — including
  `.github/`, `e2e/`, and `contract/` — for raw secret-looking values

## Live MCP Smoke Prerequisites

Dry-run and local-command smoke checks are available now:

```bash
pnpm smoke:dry-run
pnpm smoke:execute
```

Live end-to-end coverage runs separately in CI (`e2e/run-e2e.mjs`, staging
tiers — see `e2e/README.md`); the smoke harness itself stays offline by
design.

## If A Secret Leaks

If a real token is committed or printed by a check:

1. Revoke or rotate the token first.
2. Remove the raw value from the working tree.
3. Re-run `pnpm check`.
4. Purge the value from git history (e.g. `git filter-repo`) — removing it
   from the working tree alone is not enough.
