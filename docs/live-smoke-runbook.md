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
pnpm smoke:live:preflight
pnpm cursor:transport-parity
```

Live smoke can only be enabled after `docs/runtime-parity-decisions.md` has
accepted at least:

- `D2`: client runtime package or command path
- `D3`: per-client transport precedence
- `D6`: live client-to-MCP smoke gate

Until then, `pnpm smoke:live:preflight` verifies the blocked state and fails if
the docs or package scripts start claiming runnable live smoke before the
remaining D2/D3 paths and D6 test inputs are accepted. Cursor HTTP MCP config
is preserved locally, Claude plugin-local stdio config is now preserved in
`clients/claude/.mcp.json`, Hermes provider import/register behavior is
represented locally, and OpenClaw native extension metadata now points at the
built local entrypoint. Live remote exercise is still blocked on the D6
credential, endpoint/profile, cleanup decisions, Hermes live API behavior, and
OpenClaw hook/tool runtime behavior.

## Required Inputs

Before implementing `pnpm smoke:live` or equivalent CI coverage, confirm:

| Input | Required decision |
| --- | --- |
| MCP runtime | Per-client runtime path: Claude plugin-local stdio, Cursor HTTP MCP, Hermes Python package/native provider, and OpenClaw native extension package. |
| Credentials | Test-only `MEMBASE_API_KEY` policy, rotation owner, and whether CI can access the secret. |
| Endpoint | Test endpoint or explicit test profile. The default must not target a user's production context. |
| Transport | Per-client precedence plus any explicitly accepted fallback path. |
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
| Claude Code | Preserve plugin-local stdio unless a later review accepts a generic MCP package. | Validate the Claude plugin-local runtime completes remember/search/context/forget. |
| Cursor | Preserve HTTP MCP first unless a later review accepts local stdio as primary. | Validate the old HTTP MCP path or accepted fallback with the same public operation flow. |
| Hermes Agent | Preserve the Python package/native provider path unless MCP-only is accepted as equivalent. | Validate the accepted Hermes package/provider path without moving MCP config into native plugin metadata prematurely. |
| OpenClaw | Preserve native extension package path before adding MCP-only fallback behavior. | Validate accepted OpenClaw extension/config placement, hook/tool behavior, and the same public operation flow. |

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
