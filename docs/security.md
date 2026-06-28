# Secret Handling and Security

This document covers `MEM-329` and `MEM-331` security expectations for the
integrated Plugin/MCP repo. It is intentionally scoped to public connector
installation, MCP configuration, diagnostics, and smoke testing.

## Security Boundary

Public connector code may expose:

- connector capability names: remember, search, task context, and forget
- endpoint and client identity configuration
- client manifest and MCP config generation
- install diagnostics and smoke-test status

Public connector code must not expose Membase's private storage, graph,
embedding, ranking, freshness, or governance implementation details.

## Secret Model

The default auth input is an environment variable named `MEMBASE_API_KEY`.
Generated manifests and MCP config examples must reference that variable by
name. They must not embed the raw key value.

Supported public environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MEMBASE_API_KEY` | Yes for live use | API token read by the MCP server or client runtime. |
| `MEMBASE_API_BASE_URL` | No | API endpoint override. Defaults to `https://api.membase.com`. |
| `MEMBASE_PROFILE` | No | Optional profile label for client/runtime scoping. |

Client-specific generated config uses the safest reference syntax available:

- Claude, Hermes, and OpenClaw examples use `${MEMBASE_API_KEY}`.
- Cursor examples use `${env:MEMBASE_API_KEY}` because Cursor supports explicit
  environment interpolation in MCP config.

## Local Setup

Use shell or client-level secret storage for real values:

```bash
export MEMBASE_API_KEY="<membase-api-key>"
export MEMBASE_API_BASE_URL="https://api.membase.com"
```

Local env files are ignored by this repo. Only `.env.example`-style placeholder
files may be committed, and they must not contain real credentials.

## Redaction Guarantees

`packages/core` owns the shared diagnostic redaction path:

- keys matching `KEY`, `TOKEN`, `SECRET`, or `PASSWORD` are redacted by
  `redactEnvironment`
- generated MCP config documents use environment references rather than raw
  secret values
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

Live client-to-MCP smoke tests should stay pending until a shared
`@membase/mcp-server` package path or equivalent local command is available.
When live smoke is added, it should:

- require an explicit `MEMBASE_API_KEY`
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
