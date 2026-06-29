# Claude Code Connector

Claude Code adapter boundary for Membase.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` boundary.
- `.claude-plugin/plugin.json` is the canonical Claude plugin metadata.
- `.mcp.json` is the plugin-local Claude MCP config example.
- `native-artifacts.json` is the review-only snapshot of old Claude commands,
  hooks, skills, agent, bundled runtime scripts, and session-start evidence.
- `../../manifests/claude/mcp.json` is the root copy of the same MCP config.
- `../../docs/install/claude.md` documents local install and verification.

## Local Checks

```bash
pnpm --filter @membase/client-claude typecheck
pnpm claude:plugin-parity
pnpm claude:native-artifacts
pnpm public-surface
```

`pnpm claude:plugin-parity` validates the local Claude plugin manifest with the
installed Claude Code CLI, checks manifest/version drift, and keeps MCP secrets
as environment references. The generated MCP config preserves the old
plugin-local stdio shape: `node ${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs`.
The adapter only exposes connector capabilities: remember, search, task
context, and forget actions through the shared Membase Context API.

`pnpm claude:native-artifacts` verifies that
`clients/claude/native-artifacts.json` records the old Claude command, hook,
skill, agent, runtime bundle, and session-start evidence without copying those
deferred files into the integrated repo.

## Marketplace Asset Reuse

- Reuse the old Claude marketplace metadata shape and owner/license fields only
  after rewriting copy to the shared connector-capability launch copy.
- Treat old Claude commands, hooks, skills, agents, and bundled scripts as
  review-only evidence until each behavior is accepted for migration.
- No Claude image asset is selected yet.
- If a Claude icon or marketplace image is added later, place it under
  `clients/claude/assets/`, update adapter-generated metadata and committed
  manifest copies together, then run `pnpm generated-artifacts`.
