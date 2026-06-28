# Old Repo Deprecation Plan

This document tracks `MEM-332`: deprecating the old client-specific plugin
repos and concentrating GitHub stars, installs, issues, and marketplace links on
the integrated Plugin/MCP repo.

This is a non-mutating review plan. It does not archive repositories, update
GitHub descriptions, edit old READMEs, publish packages, or submit marketplace
changes.

## Rules

- Use the Linear project `Plugin/MCP 통합 레포 출시` as source of truth.
- Do not delete old repositories; keep them available for history and users who
  have pinned old install paths.
- Do not archive old repositories until the integrated repo has review-ready
  install docs, manifest/config examples, marketplace copy, and passing local
  checks.
- Route new users, issues, marketplace links, and launch traffic to the
  integrated repo after the replacement path is confirmed.
- Rewrite public deprecation copy around connector capabilities and migration
  paths. Do not repeat old implementation-specific claims about Membase's
  storage, graph, embedding, ranking, or internal memory engine.
- Do not move secrets, user config, production credentials, or old local state
  into this repo.

## Replacement Repo Readiness Gates

All gates should pass before any old repo README notice or archive request is
opened:

- [x] Integrated repo has package/workspace/client/docs/smoke structure.
- [x] Architecture decision exists at
  `docs/adr/0001-integrated-connector-repo.md`.
- [x] Claude, Cursor, Hermes, and OpenClaw adapter boundaries exist.
- [x] Install docs exist for all four clients.
- [x] Migration parity inventory exists in `docs/migration-parity.md`.
- [x] Marketplace asset checklist exists in `docs/marketplace-assets.md`.
- [x] Security and secret-handling expectations exist in `docs/security.md`.
- [x] `pnpm check` covers typecheck, generated artifacts, smoke dry-run,
  secret hygiene, and public-surface guarding.
- [ ] Final public repository URL is confirmed.
- [ ] Final MCP server package or command path is confirmed.
- [ ] Final remote MCP URL compatibility decision is recorded per client.
- [ ] First integrated release tag or launch branch is selected.
- [ ] Client-native runtime parity decisions are either implemented or
  explicitly deferred per client.
- [ ] `pnpm check` and `pnpm smoke:execute` pass immediately before notices are
  proposed.

## Current Old Repo Snapshot

Observed from public GitHub repository pages on 2026-06-28. Star counts can
drift and should be refreshed before any launch decision.

| Old repo | Public snapshot | Deprecation handoff |
| --- | --- | --- |
| `aristoapp/claude-membase` | Claude Code plugin repo, 3 stars, TypeScript/Bun plugin with marketplace metadata, commands, hooks, skills, tests, and plugin-local MCP config. | Point new installs to the integrated Claude install doc after command/hook/skill parity is either migrated or explicitly deferred. |
| `aristoapp/cursor-membase` | Cursor plugin repo, 1 star, plugin metadata, MCP config, rules, skills, logo, README, and changelog artifacts. | Point new installs to the integrated Cursor install doc after remote MCP URL compatibility and logo/rules/skills decisions are recorded. |
| `aristoapp/hermes-membase` | Hermes plugin repo, 12 stars, Python package-style provider with native plugin YAML and tests. | Point new installs to the integrated Hermes install doc after the Python package dependency versus MCP-only path is decided. |
| `aristoapp/openclaw-membase` | OpenClaw plugin repo, 37 stars, TypeScript native plugin with manifest, extension metadata, commands, hooks, tools, skills, and tests. | Point new installs to the integrated OpenClaw install doc after native extension entrypoint/auth parity is decided. |

## Deprecation Sequence

### Phase 0: Review Only

- Keep all old repos untouched.
- Finish this integrated repo's review artifacts.
- Confirm the replacement repository path, package command, live MCP smoke
  prerequisite, and per-client compatibility decisions.
- Run `pnpm check` and `pnpm smoke:execute`.

### Phase 1: Notice PRs

Open a small PR in each old repo with only public-facing migration notices:

- Add a top-of-README banner pointing to the integrated repo.
- Update install links to the relevant integrated install guide.
- Update support and issue routing to the integrated repo.
- Keep old install instructions below the banner under a "legacy install" or
  "pinned installs" section if existing users still need them.
- Remove or rewrite public copy that describes private implementation details.
- Do not change old runtime code unless a compatibility fix is needed.

Suggested README banner:

```markdown
> This connector has moved to the integrated Membase Plugin/MCP repo:
> https://github.com/aristoapp/membase-plugin-mcp
>
> This repository is kept for compatibility and historical reference. New
> installs, issues, and marketplace review should use the integrated repo.
```

### Phase 2: Compatibility Window

- Leave old repos unarchived while users migrate.
- Keep issue templates or pinned issues pointing to the integrated repo.
- Triage only critical compatibility/security fixes in old repos.
- Do not add new feature work to old repos.
- Keep marketplace and package metadata pointed at either the old repo or the
  integrated repo according to each client host's review process.

### Phase 3: Archive Request

Request archiving only after the compatibility window has no blocking installs,
issues, or marketplace review dependencies.

Before archive:

- Close or migrate open issues and PRs that are still relevant.
- Confirm old README notices and repo descriptions point to the integrated repo.
- Confirm package/marketplace links no longer require old repo mutation.
- Record final old repo state in this repo's `RUN_LOG.md`.

Archiving should be preferred over deletion because the old repos remain useful
for history, pinned dependency review, and migration audits.

### Phase 4: Star Concentration Launch

- Use a single launch URL: the integrated repo.
- Ensure old README banners, marketplace metadata, docs, and social copy point
  to the integrated repo.
- Avoid asking users to star multiple old repos.
- Keep the launch message focused on the Linear project scope: one integrated
  repo for shared auth/install/MCP core, four client adapters, install docs,
  smoke tests, marketplace assets, and deprecation handoffs.

## Per-Client Handoff Checklist

### Claude Code

- [ ] Decide whether old commands, skills, agents, hooks, and session-start
  behavior move into this repo or remain legacy.
- [ ] Decide final plugin source path for Claude marketplace review.
- [ ] Draft old README notice with links to `docs/install/claude.md`.
- [ ] Preserve old repo history for users pinned to the Bun/TypeScript plugin.

### Cursor

- [ ] Decide whether old remote MCP URL compatibility is preserved alongside the
  local stdio config.
- [ ] Decide whether old rules and skills are rewritten and ported.
- [ ] Port the logo only after asset review, then update adapter output and
  committed manifest copies together.
- [ ] Draft old README notice with links to `docs/install/cursor.md`.

### Hermes Agent

- [ ] Decide whether the old Python package remains the runtime dependency,
  moves into this repo, or is replaced by MCP-only config for the first review.
- [ ] Decide whether the old banner is reused, replaced, or omitted.
- [ ] Draft old README notice with links to `docs/install/hermes.md`.
- [ ] Keep provider/package migration separate from public connector API docs.

### OpenClaw

- [ ] Decide native extension entrypoint parity versus MCP-only review config.
- [ ] Decide auth/config schema parity for the native OpenClaw manifest.
- [ ] Draft old README notice with links to `docs/install/openclaw.md`.
- [ ] Preserve old runtime tests as parity references until hook/tool migration
  is accepted or explicitly deferred.

## Evidence

- GitHub archive behavior and pre-archive guidance:
  https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories
- Old Claude repo:
  https://github.com/aristoapp/claude-membase
- Old Cursor repo:
  https://github.com/aristoapp/cursor-membase
- Old Hermes repo:
  https://github.com/aristoapp/hermes-membase
- Old OpenClaw repo:
  https://github.com/aristoapp/openclaw-membase
