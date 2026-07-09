# Pre-Publish Checklist

A one-time checklist for taking `membase-plugin-mcp` public. The code-side
cleanup is done (chore/pre-publish-cleanup); what remains below needs a human
decision or GitHub settings access.

> ⚠️ **This file is itself internal.** Delete it (`git rm PRE_PUBLISH_CHECKLIST.md`)
> as the last step before you make the repo public.

## Done (cleanup PR)

- [x] Secrets: `.env*`/`repomix*` ignored; working-tree secret sweep clean
  (`pnpm secret-hygiene` + pattern grep).
- [x] License & community health files: LICENSE (MIT), CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, issue/PR templates.
- [x] Public docs cleaned (README, client READMEs, architecture, ADRs).
- [x] Internal docs removed: PLAN.md, RUN_LOG.md, automation/,
  docs/context.html, docs/implementation-overview.html,
  docs/research/oss-targets.md, and the eleven parity/launch process docs —
  together with the four retired guards (review-readiness,
  runtime-decision-ledger, packaging-action-parity, launch-handoff) and every
  remaining reference in guards, smoke/e2e docs, contract/spec.md, and code
  comments.
- [x] AGENTS.md trimmed to a public contributor pointer; MAP.md committed
  (README linked it but it was never tracked).
- [x] Scratch dirs (`review/`, `batch-review/`, `decisions/`, `openwiki/`,
  `repomix*`) confirmed untracked and gitignored.

## Remaining — human decisions

- [ ] **Git history**: internal docs (RUN_LOG.md, PLAN.md, parity docs) remain
  readable in past commits. For a clean public start: squash to a single
  initial commit, or `git filter-repo` the internal paths. If any real secret
  ever touched history, rotate it regardless.
- [ ] Confirm `support@aristo.so` (SECURITY.md, CODE_OF_CONDUCT.md) is
  monitored, or change it.
- [ ] Update the LICENSE copyright holder if it should be a legal entity name
  rather than "Membase".
- [ ] Version bump for the first public release: bump `package.json` (root) to
  `0.1.0`, mirror it in every path `scripts/check-version-parity.mjs` lists
  (workspace packages, plugin.json manifests, hermes plugin.yaml, pyproject),
  then run `pnpm generate && pnpm check`. Deferred from the cleanup PR to
  avoid conflicting with in-flight feature branches.

## Remaining — GitHub settings

- [ ] Repo description + topics (`mcp`, `ai-agents`, `memory`, `claude-code`,
  `cursor`, `plugin`).
- [ ] Enable Discussions (issue-template `config.yml` links to it).
- [ ] Branch protection on `main` (require CI + review).
- [ ] After flipping public: confirm the CI badge renders and spot-check README
  links on GitHub.

## Final

- [ ] `pnpm check` green on `main`.
- [ ] `git rm PRE_PUBLISH_CHECKLIST.md` (this file).
- [ ] Flip repository visibility to public.
