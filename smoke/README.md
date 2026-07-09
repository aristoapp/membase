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

The dry-run harness imports the built client adapters, validates each
generated MCP config (no leaked sentinel secret, correct transport shape),
and verifies each adapter declares executable smoke commands.

Secret handling expectations and live MCP smoke prerequisites are documented in
`docs/security.md`.

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

`pnpm smoke:live:preflight` validates the committed MCP config examples:
Claude uses the plugin-local stdio server, Cursor/Hermes/OpenClaw use the
remote HTTP endpoint, and no config carries a user-supplied API key.
