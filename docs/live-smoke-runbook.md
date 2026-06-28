# Live MCP Smoke Runbook

This runbook defines the launch-gate shape for live client-to-MCP smoke tests.
It is a review artifact for the Linear project `Plugin/MCP 통합 레포 출시`; it
does not publish packages, install global client plugins, mutate GitHub or
Linear state, or call production user data by default.

## Current Status

Live MCP smoke is intentionally pending.

The local repo already verifies generated artifacts, dry-run client smoke,
secret hygiene, public connector wording, review readiness, and adapter-declared
local commands:

```bash
pnpm check
pnpm smoke:execute
```

Live smoke can only be enabled after `docs/runtime-parity-decisions.md` has
accepted at least:

- `D2`: shared MCP server command or package path
- `D3`: per-client transport precedence
- `D6`: live client-to-MCP smoke gate

## Required Inputs

Before implementing `pnpm smoke:live` or equivalent CI coverage, confirm:

| Input | Required decision |
| --- | --- |
| MCP runtime | Package name, local command, version pinning, and whether the check may run `npx` or must use a local path. |
| Credentials | Test-only `MEMBASE_API_KEY` policy, rotation owner, and whether CI can access the secret. |
| Endpoint | Test endpoint or explicit test profile. The default must not target a user's production context. |
| Transport | Per-client support for local stdio, remote MCP URL, or both. |
| Cleanup | Whether test memories are deleted immediately, marked forgotten, or cleaned by a scheduled test profile policy. |
| Logging | Redacted diagnostics format and whether generated config shape may be printed. |

## Live Smoke Contract

A live check should exercise the same public connector capability boundary as
the dry-run smoke harness:

1. Build or resolve the client adapter MCP config.
2. Launch the confirmed MCP runtime with test-only environment variables.
3. Verify authentication without printing raw secrets.
4. Create a uniquely tagged test memory or observation.
5. Search for the test content.
6. Request task context that includes the test content.
7. Delete or forget the test item.
8. Re-run search to confirm cleanup.
9. Print only redacted diagnostics, generated config shape, client id, smoke id,
   and short operation summaries.

The live check must not inspect or assert private Membase implementation
details. It should treat storage, retrieval, scoring, and cleanup internals as
server-owned behavior behind the public connector contract.

## Test Data Shape

Use deterministic, easy-to-clean test metadata:

| Field | Value |
| --- | --- |
| Profile | `client-live-smoke` unless a different test profile is accepted. |
| Source system | `membase-plugin-mcp-live-smoke`. |
| Source id | `live-smoke-${clientId}-${timestamp}`. |
| Tags | `smoke`, `plugin-mcp`, client id, and a timestamp bucket. |
| Content | Short sentinel text with no private user context. |
| Cleanup reason | `live smoke cleanup`. |

The check should fail if cleanup does not complete, and the failure output
should include the smoke id and client id so manual cleanup can be performed
without exposing secrets.

## Per-Client Gate

| Client | Live smoke precondition | First acceptable live check |
| --- | --- | --- |
| Claude Code | Confirm whether launch uses the shared MCP package directly or a Claude plugin wrapper. | Validate generated Claude MCP config launches the Membase MCP runtime and completes remember/search/context/forget. |
| Cursor | Confirm local stdio versus remote URL precedence. | Validate `.cursor/mcp.json`-compatible config with Cursor env interpolation and the same public operation flow. |
| Hermes Agent | Confirm whether Hermes keeps a native provider package, translates MCP config, or uses MCP-only runtime. | Validate the accepted Hermes path without moving MCP server config into native plugin metadata. |
| OpenClaw | Confirm native extension entrypoint and whether the first launch is MCP-only or plugin-plus-MCP. | Validate accepted OpenClaw config placement and the same public operation flow. |

## Redaction Requirements

Live smoke output may include:

- client id
- command name
- generated config keys
- redacted environment diagnostics
- smoke id
- operation status

Live smoke output must not include:

- raw `MEMBASE_API_KEY`
- raw bearer tokens or provider tokens
- private user memories
- server storage records
- internal ranking, graph, embedding, chunking, or memory engine details

## Acceptance Checklist

- [ ] `D2`, `D3`, and `D6` are accepted in `docs/runtime-parity-decisions.md`.
- [ ] Test credentials and endpoint are confirmed.
- [ ] Live smoke defaults to test-only profile data.
- [ ] Cleanup is verified and failure output includes a manual-cleanup id.
- [ ] Redaction is covered by an automated assertion.
- [ ] `pnpm check`, `pnpm smoke:execute`, and the new live smoke command pass.
- [ ] `RUN_LOG.md` records the command, timestamp, and redacted result.

## Non-Mutating Boundary

This runbook does not authorize package publishing, marketplace submission,
old-repo notice updates, GitHub repository changes, Linear updates, or global
client installation. Those actions remain blocked until Jaehwan explicitly asks
for them.
