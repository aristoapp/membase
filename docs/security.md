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
| Claude Code | Bundled stdio MCP server (`node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`) | Plugin-managed login. |
| Hermes Agent | Native `hermes-membase` pip package (or remote MCP URL) | OAuth flow. |
| OpenClaw | Native plugin (or remote MCP URL) | OAuth access/refresh tokens cached in a `tokenFile`. |

Supported public configuration values:

| Value | Required | Purpose |
| --- | --- | --- |
| `apiUrl` / `MEMBASE_API_BASE_URL` | No | API endpoint override. Defaults to `https://api.membase.so`. |
| `MEMBASE_PROFILE` | No | Optional profile label for client/runtime scoping. |
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

`packages/core` owns the shared diagnostic redaction path:

- keys matching `KEY`, `TOKEN`, `SECRET`, or `PASSWORD` are redacted by
  `redactEnvironment`
- generated MCP config documents carry no embedded credentials: remote-URL
  configs use empty headers, and the bundled Claude server config carries only
  a non-secret plugin flag
- `pnpm core:contract` validates environment-reference generation and
  diagnostic redaction at the shared core boundary
- `smoke/client-smoke.mjs` injects a fake sentinel secret and fails if adapter
  diagnostics or MCP config include that raw value
- `scripts/check-secret-hygiene.mjs` scans committed connector artifacts for
  raw secret-looking values and validates sensitive MCP env entries

## Live MCP Smoke Prerequisites

Dry-run and local-command smoke checks are available now:

```bash
pnpm smoke:dry-run
pnpm smoke:execute
```

Live client-to-MCP smoke tests should stay pending until the remaining
client-specific runtime behavior and live test inputs are accepted. Claude
plugin-local stdio, Cursor HTTP MCP config, Hermes provider register behavior,
and OpenClaw native entrypoint metadata are preserved, but live exercise still
needs explicit test credentials, endpoint/profile, and cleanup policy.
When live smoke is added, it should:

- authenticate through the client's OAuth or plugin login flow, never an
  embedded credential
- default to a test profile or test endpoint, not a user's production context
- create a clearly tagged test memory
- verify remember, search, context, and forget behavior
- delete or forget the test memory before exiting
- log only redacted environment diagnostics, generated config shape, ids, and
  short summaries

## If A Secret Leaks

If a real token is committed or printed by a check:

1. Revoke or rotate the token first.
2. Remove the raw value from the working tree.
3. Re-run `pnpm check`.
4. Before publishing this repo, remove the value from git history or restart
   from a clean history.
