# Smoke Tests

Smoke tests should verify the public connector contract only:

1. Install or generate client config.
2. Authenticate without leaking secrets.
3. Save a test memory.
4. Search or recall that memory.
5. Delete or forget the test memory.

## Current Harness

```bash
pnpm smoke:dry-run
pnpm smoke:execute
```

The dry-run harness imports the built Claude, Cursor, Hermes, and OpenClaw
adapters, validates each generated MCP config, checks that diagnostics redact
API key values, verifies each adapter declares executable smoke commands, and
exercises the public remember/search/context/delete flow through
`smoke/public-contract-stub.mjs`.

Secret handling expectations and live MCP smoke prerequisites are documented in
`docs/security.md`. The future live client-to-MCP smoke launch gate is defined
in `docs/live-smoke-runbook.md`.

Old repo test migration expectations are mapped in
`docs/test-coverage-parity.md`.

`pnpm smoke:execute` runs the adapter-declared local commands after the same
contract checks. It does not publish, install global client plugins, or call the
Membase API.

Live client-to-MCP smoke coverage is intentionally pending until the shared
`@membase/mcp-server` runtime package or an equivalent local command path is
available.
