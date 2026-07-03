# Connector Consolidation — Group B Execution Plan (Hermes, OpenClaw)

Group B connectors are **embedded runtimes** (not MCP hosts): they call the
Membase REST API directly (their own `MembaseClient` + OAuth + tools), so unlike
Group A there IS real runtime to bring in. Per Jaehwan's decision, Group B uses
**pure copy-in (option a): bring the working standalone runtime in AS-IS, then
refactor later.** Do NOT rewrite-as-adapter up front.

Reference: `docs/consolidation-execution-plan.md` (Group A), memory
`connector-consolidation-goal.md` (strategy + the copy-in decision).

## Hermes (Python) — copy standalone into `clients/hermes/python/`

Target scaffold `clients/hermes/python/src/hermes_membase/` is a stub ("Review
scaffold", v0.0.0, provider returns "runtime disabled"). Replace with the real
`hermes-membase` runtime.

Decisions:
- **Package name:** adopt the source name `membase_hermes` (source uses it; the
  scaffold's `hermes_membase` is arbitrary). Delete the `hermes_membase` stub,
  copy source `membase_hermes/` in. Less edit surface than renaming source.
- Copy all 17 files: `__init__, __main__, capture, cli, client, config, format,
  installer, mirror, oauth, provider, sanitize, star_prompt, update_check`,
  `plugin/{__init__,cli}.py`, `plugin/plugin.yaml`. Includes the headless-auth
  from aristoapp/hermes-membase#2 (config env + oauth exchange_client_credentials
  + client resolve_auth_state) — comes along for free.
- **pyproject:** replace scaffold with real deps (`httpx`, `PyYAML`), version
  0.1.6, entry points `membase_hermes.cli:main` / `membase_hermes.installer:main`,
  package-data `membase_hermes = ["plugin/*.yaml"]`. Drop dev-deps/ruff/mypy
  sections (monorepo owns those).
- **Checks to update** (they hard-code the stub layout):
  - `scripts/check-hermes-python-parity.mjs` — entry-point/package-data/import
    strings `hermes_membase` → `membase_hermes`; the provider boundary import.
  - `scripts/check-hermes-native-artifacts.mjs` — path prefixes to
    `src/membase_hermes/...`; the scaffold-only markers ("Runtime API calls
    remain disabled") no longer hold once the real provider lands → flip the
    native-artifacts policy status from review-only to ported/accepted.
- Tests: defer (leave standalone tests out for now, or a later PR).

## OpenClaw (Bun/TS) — copy standalone into `clients/openclaw/runtime/`

Target `clients/openclaw/src/index.ts` is ALREADY the connector-sdk adapter
(Group A) — collides with the standalone's `src/index.ts` (plugin `register()`).
So place the runtime in a **subdir**: `clients/openclaw/runtime/` as its own
workspace package `@membase/openclaw-membase-runtime`.

Decisions:
- Copy all `openclaw-membase/src/**` (index, client, config, types, utils,
  format, star-prompt, update-check, commands/cli, hooks/{capture,recall},
  tools/{8}) + `index.ts` + `biome.json` into `runtime/`.
- New `runtime/package.json` (private workspace pkg, peer dep `openclaw`) +
  `runtime/tsconfig.json` (extends base, excludes `*.test.ts` for now).
- Adapter `clients/openclaw/package.json`: add runtime as `workspace:*` dep;
  build/typecheck also build `runtime/tsconfig.json`. Add runtime to root
  `tsconfig.json` references.
- Tests (`*.test.ts`, Bun) — exclude from tsc, defer migration to vitest/node.
- **Checks to update:** `scripts/check-openclaw-native-artifacts.mjs` currently
  asserts the runtime files DON'T exist (review-only). Flip to assert they exist
  under `runtime/src/**` and update artifact statuses.
- Bun APIs already have Node fallbacks (`typeof Bun !== "undefined"`); JSON
  import assertions OK under NodeNext.

## Sequencing & guardrails
1. **Hermes first** (lower risk, single package). Copy → pyproject → update the
   2 hermes checks → `pnpm check` green → commit.
2. **OpenClaw second** (subdir package + build wiring). Copy → runtime pkg/tsconfig
   → adapter pkg + root tsconfig → update openclaw checks → `pnpm check` green →
   commit.
3. Every step ends with `pnpm check` green + no secrets committed.
4. This is copy-in ONLY. Refactoring generic runtime into a shared core, test
   migration, and the deprecation of the standalone repos are LATER phases.
