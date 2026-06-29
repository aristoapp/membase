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
pnpm smoke:live:preflight
pnpm version-parity
pnpm claude:plugin-parity
pnpm cursor:transport-parity
pnpm hermes:python-parity
pnpm openclaw:native-parity
```

The dry-run harness imports the built Claude, Cursor, Hermes, and OpenClaw
adapters, validates each generated MCP config, checks that diagnostics redact
API key values where configs use local env, verifies Cursor HTTP MCP shape,
verifies each adapter declares executable smoke commands, and exercises the
public remember/search/context/delete flow through
`smoke/public-contract-stub.mjs`.

Secret handling expectations and live MCP smoke prerequisites are documented in
`docs/security.md`. The future live client-to-MCP smoke launch gate is defined
in `docs/live-smoke-runbook.md`.

Old repo test migration expectations are mapped in
`docs/test-coverage-parity.md`.

`pnpm smoke:execute` runs the adapter-declared local commands after the same
contract checks. It does not publish, install global client plugins, or call the
Membase API.

`pnpm claude:plugin-parity` validates the Claude plugin metadata with the
installed Claude Code CLI and checks manifest/version/MCP secret-reference
drift without marketplace submission.

`pnpm version-parity` verifies that package versions, public plugin manifest
versions, Hermes Python/YAML package metadata, and MCP client-version examples
stay synchronized without deciding a release tag or enabling publication.

`pnpm cursor:transport-parity` verifies that committed Cursor MCP examples keep
the old HTTP MCP endpoint and do not regress to the generic stdio placeholder.

`pnpm hermes:python-parity` validates the Hermes Python package review
scaffold, console script entrypoints, native YAML package data, Python syntax,
provider import/register behavior, and non-publishing boundary.

`pnpm openclaw:native-parity` is the OpenClaw host-specific local parity gate
from the old repo workflow. It runs the integrated OpenClaw typecheck/build
path, imports the built native extension entrypoint, and keeps the native
manifest/package in a non-publishing review state.

Live client-to-MCP smoke coverage is intentionally pending until the remaining
client-specific runtime behavior and accepted live test credentials are in
place: Hermes live API behavior and OpenClaw native hook/tool behavior. Claude
plugin-local stdio, Cursor HTTP MCP config, Hermes provider register path, and
OpenClaw native extension entrypoint are preserved locally, but live remote
exercise still needs the D6 credential and cleanup decision.

`pnpm smoke:live:preflight` keeps that pending state honest. It verifies that
D2 and D3 record the Claude plugin-local, Cursor HTTP-first, Hermes provider
register path, and OpenClaw native entrypoint implementation while Hermes live
API behavior and fallback decisions stay pending in
`docs/runtime-parity-decisions.md`, D6 is only accepted in principle, the
runbook still names those prerequisites, and the committed MCP examples do not
claim live smoke is runnable.
