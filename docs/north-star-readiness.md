# North-Star Readiness — Deprecating the Standalone Connector Repos

Tracks the final gate before `MEM-332` executes: everything the four standalone
repos (`claude-membase`, `cursor-membase`, `hermes-membase`, `openclaw-membase`)
provide now lives in this repo. **Publishing and archiving stay frozen until
BOTH the automated verification below is green AND Jaehwan has signed off on
the manual checks.** This is a deliberate two-key gate.

## What "everything is in" means (as of consolidation Group C)

| Client | Runtime home in this repo | Coverage |
| --- | --- | --- |
| Claude | `clients/claude/runtime` (commands, hooks, skills, agent, bundled stdio MCP server `plugin/scripts/mcp-server.cjs`, TS source, tests) | typecheck + bun tests in CI; `claude:native-artifacts` asserts ported inventory |
| Cursor | `clients/cursor/{rules,skills,assets,CHANGELOG.md}` (static artifacts; remote HTTP MCP) | `cursor:native-artifacts` asserts ported inventory |
| Codex | `clients/codex` (net-new adapter, Group A) | smoke + e2e |
| Hermes | `clients/hermes/python` (provider, OAuth incl. headless client_credentials, capture, mirror, CLI, installer, tests) | unittest suite in CI; parity + native-artifact guards |
| OpenClaw | `clients/openclaw/runtime` (plugin runtime: client, hooks, tools, commands, manifest, tests) | typecheck + bun tests in CI; native-artifact guards |

Deliberately NOT done yet (post-launch): shared-core dedupe of the three
copied runtimes; publishing (npm/PyPI/marketplaces); archiving old repos.

## Gate 1 — automated (AI-verifiable, rerun any time)

- [ ] `pnpm check` green on `main` (includes all parity/native guards and
  runtime typechecks).
- [ ] CI green on `main`: hermes unittests, claude + openclaw bun tests,
  `pnpm smoke:execute`, e2e Tier 1 + Tier 2.
- [ ] e2e Tier 3 (deep quality) green against staging:
  `gh workflow run e2e-staging.yml --ref main -f tier=3`.
- [ ] Live OpenClaw integration verified on a real gateway (plugin loads from
  this repo, `membase_search`/`membase_search_wiki` return results).

## Gate 2 — manual sign-off (Jaehwan)

Each item verifies a real install path end-to-end, the way a user would hit it:

- [ ] **Claude Code**: install the plugin from `clients/claude/runtime/plugin`
  (marketplace-style local install), confirm `/membase:login`, `/membase:remember`,
  `/membase:recall` commands work and the session-start hook injects context.
- [ ] **Cursor**: point Cursor at `clients/cursor/mcp.json`, confirm the
  membase MCP tools appear and a remember→search round-trip works; rules and
  skills render.
- [ ] **Codex CLI**: `~/.codex/config.toml` per `docs/install/codex.md`,
  confirm tools respond.
- [ ] **Hermes**: install `clients/hermes/python` into a Hermes host
  (`pip install -e`), run `hermes-membase-install`, confirm provider loads and
  memory tools + auto-capture work; headless `client_credentials` path once.
- [ ] **OpenClaw**: already running live from this repo on the Mac gateway —
  confirm the Telegram bot memory flows once more after the final merge.
- [ ] Skim `docs/install/*.md` — every instruction matches what you just did.

## When both gates are checked

Only then, in order (each its own reviewed change):

1. Version/tag decision + first release tag (D1 leaves naming open).
2. Publishing: npm (claude/openclaw runtimes if desired), PyPI (hermes),
   marketplace submissions per `docs/marketplace-assets.md`.
3. Old-repo deprecation notices + archive per `docs/deprecation-plan.md`
   (READMEs point here; repos archived, not deleted).
4. Retire the standalone working copies under `~/Desktop/membase/` once launch
   gates pass.
