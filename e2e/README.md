# Connector E2E Verification & Eval

End-to-end harness that verifies each client connector against the **live**
Membase MCP server and evaluates quality and latency. Dependency-free (Node 18+
`fetch`). This is the runnable implementation of `docs/live-smoke-runbook.md`.

## Tiers

**Tier 1 — reachability + protocol + discovery (no credentials).** Runs now.

```bash
pnpm e2e
```

For every committed client MCP config it proves the configured endpoint is a
live, spec-compliant, correctly-secured MCP server:

- OAuth protected-resource discovery (RFC 9728) is reachable and its `resource`
  matches the configured URL, with `authorization_servers` = `api.membase.so`.
- An MCP `initialize` handshake reaches the server and is correctly OAuth-gated
  (`401` + `WWW-Authenticate: Bearer resource_metadata=...`).
- Per-step latency is measured.

Stdio clients (Claude) are config-validated only — the bundled server ships in
the Claude plugin repo, so its live run belongs in that repo's e2e.

**Tier 2 — live lifecycle + quality/latency eval (needs a token).**

```bash
MEMBASE_MCP_TOKEN="<oauth-access-token>" pnpm e2e:live
```

Against the live server it runs the public contract lifecycle per HTTP client
and scores it:

- `tools/list` exposes remember / search / getContext / forget.
- **remember** returns an id.
- **recall@1**: a follow-up **search** for the sentinel returns the memory
  (search is repeated to report p50/p95 latency).
- **getContext** responds without error.
- **forget** removes the memory (a final search no longer recalls it).

Obtain the token through the client's normal OAuth flow (authorization server
`https://api.membase.so`, per the discovery metadata). Use a test-only account;
the harness tags its data with a unique sentinel and forgets it at the end.

## Output

A per-client scorecard (pass/fail checks, latency, quality metrics) and a
`k/N clients passed` summary. Exit code is non-zero if any client fails its
tier's checks.

## Scope

Live-network + credential-gated, so it is intentionally **not** part of
`pnpm check`. Run it manually or in a scheduled/CI job that can hold a
test-only Membase token.
