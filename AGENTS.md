# AGENTS.md

Guidance for AI coding agents working in this repository. The human
contributor guide applies to agents unchanged — read
[CONTRIBUTING.md](CONTRIBUTING.md) first for setup, the branch → check → PR
flow, and commit conventions.

Repo-specific rules:

- **`pnpm check` must pass before any PR.** It chains every CI guard:
  generated-artifact parity, secret hygiene, native-artifact ledgers, version
  parity, public-surface enforcement, and per-runtime typechecks.
- **The connector contract is fixed and small**: `remember` / `search` /
  `getContext` / `deleteOrForget` plus manifest/config generation and smoke
  tests. Keep server-side implementation details out of this repo —
  `pnpm check`'s public-surface guard fails the build otherwise.
- **Layering points down only**: client-specific behavior stays in
  `clients/*`, shared behavior in `packages/*`. See [MAP.md](MAP.md) for
  where things live and [docs/adr/](docs/adr/) for why.
- **After touching a descriptor, adapter, or `packages/connector-sdk`**, run
  `pnpm generate` so committed manifests/configs stay in sync with the
  adapters.
