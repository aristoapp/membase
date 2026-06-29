# Hermes Agent Connector

Hermes Agent adapter boundary for Membase.

## Artifacts

- `src/index.ts` implements the SDK `ClientAdapter` boundary.
- `plugin/plugin.yaml` is the native Hermes plugin metadata placeholder.
- `mcp.json` is the Hermes-oriented MCP config example.
- `python/` is the non-publishing Python package review scaffold for the
  existing Hermes runtime path, including an importable provider/register
  boundary.
- `native-artifacts.json` is the review-only inventory of old Hermes provider,
  capture, OAuth, wiki, formatting, asset, update-check, and test evidence.
- `../../manifests/hermes/` contains the root reviewable manifest copies.
- `../../docs/install/hermes.md` documents local install and verification.

## Local Checks

```bash
pnpm --filter @membase/client-hermes typecheck
pnpm hermes:python-parity
pnpm hermes:native-artifacts
pnpm public-surface
```

`pnpm hermes:python-parity` validates the Python package metadata, console
script entrypoints, native YAML sync, Python syntax, provider import/register
behavior, and non-publishing boundary. The adapter only exposes connector
capabilities: remember, search, task context, and forget actions through the
shared Membase Context API.
`pnpm hermes:native-artifacts` verifies `clients/hermes/native-artifacts.json`
and keeps old Hermes runtime modules and assets uncopied until explicit review
accepts each behavior.

## Marketplace Asset Reuse

- Treat the old `aristoapp/hermes-membase` `hermes-membase-banner.png` as the
  Hermes banner candidate.
- Do not reference the banner from generated metadata until the file is copied
  under `clients/hermes/assets/` and approved for reuse.
- Keep Hermes native YAML metadata separate from shared MCP config examples when
  adding any catalog-specific asset fields.
- After any generated asset field is added, update committed manifest copies and
  run `pnpm generated-artifacts`.
