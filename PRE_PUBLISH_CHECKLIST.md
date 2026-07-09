# Pre-Publish Checklist

A one-time checklist for taking `membase-plugin-mcp` public. Work top to bottom.
Items marked ✅ were already done in the docs/community pass; the rest need your
decision or a command.

> ⚠️ **This file is itself internal.** Delete it (`git rm PRE_PUBLISH_CHECKLIST.md`)
> as the last step before you make the repo public.

## 1. Secrets & credentials

- [x] ✅ `.env.staging-live` is **not** tracked by git, and `.gitignore` covers
  `.env*`.
- [x] ✅ `repomix*.md` context dumps are not tracked and are now gitignored.
- [ ] Do a final secret sweep before flipping visibility:

  ```bash
  pnpm secret-hygiene
  git grep -nEi '(api[_-]?key|secret|token|password|bearer)\s*[:=]' -- ':!*.md' ':!pnpm-lock.yaml'
  ```

- [ ] Confirm no real tokens exist anywhere in **git history** (see §5).

## 2. License & community health files

- [x] ✅ `LICENSE` (MIT, © 2026 Membase) — update the copyright holder if it
  should be a legal entity name rather than "Membase".
- [x] ✅ `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
- [x] ✅ `.github/ISSUE_TEMPLATE/` (bug + feature forms, config) and
  `.github/pull_request_template.md`
- [ ] Confirm the contact email in `SECURITY.md` and `CODE_OF_CONDUCT.md`
  (`support@aristo.so`) is monitored, or change it.

## 3. Public docs cleaned

- [x] ✅ `README.md` rewritten for a community audience (no Linear/MEM refs).
- [x] ✅ Per-client READMEs (`clients/*/README.md`) rewritten as user-facing
  install/usage docs.
- [x] ✅ `docs/architecture.md` trimmed to a public architecture doc.
- [x] ✅ Linear project name and `MEM-3xx` ticket IDs removed from
  `docs/adr/0001`, `docs/adr/0002`, `docs/adr/0003`, `docs/security.md`.
- [x] ✅ Personal name (`Jaehwan`) removed from public ADRs.

## 4. Internal-only files to remove

These are **tracked** internal process/planning docs. They aren't secrets, but
they reference Linear, the old repos, launch gates, and personal sign-offs, and
add noise to a public repo. Recommended: remove them.

> ⚠️ **Build coupling:** several of these are required by CI guards wired into
> `pnpm check`. If you delete the docs without also removing the guards, the
> build will fail. Do the removal in **one commit**: docs + guards + the
> matching `package.json` script entries, then run `pnpm check`.

Internal planning/process docs:

```bash
git rm PLAN.md RUN_LOG.md \
  docs/context.html \
  docs/migration-parity.md \
  docs/test-coverage-parity.md \
  docs/packaging-action-parity.md \
  docs/marketplace-assets.md \
  docs/deprecation-plan.md \
  docs/runtime-parity-decisions.md \
  docs/review-summary.md \
  docs/live-smoke-runbook.md \
  docs/north-star-readiness.md \
  docs/consolidation-execution-plan.md \
  docs/consolidation-execution-plan-group-b.md
```

Guards / scripts that reference the docs above. Remove the guard files **and**
their entries in the `check` script in `package.json`, or edit the guard to stop
requiring the removed docs:

- `scripts/check-review-readiness.mjs` — its `requiredFiles` array lists
  `PLAN.md`, `docs/context.html`, migration-parity, test-coverage-parity,
  packaging-action-parity, marketplace-assets, deprecation-plan,
  runtime-parity-decisions, review-summary, and live-smoke-runbook, and
  `documentMarkers` asserts content inside several of them. Remove those entries
  when you remove the docs. (The README/architecture/client-README markers in
  this guard were already updated to match the new public docs.)
- `scripts/check-runtime-decision-ledger.mjs` — requires runtime-parity-decisions
- `scripts/check-packaging-action-parity.mjs` — requires packaging-action-parity
- `scripts/check-launch-handoff-consistency.mjs` — requires marketplace-assets,
  deprecation-plan, review-summary, runtime-parity-decisions

After editing, verify the gate still passes:

```bash
pnpm check
```

`AGENTS.md` is an internal agent-handoff doc (multiple working copies, launch
gates, personal sign-off). Options:

- [ ] Remove it: `git rm AGENTS.md`, **or**
- [ ] Trim it to a short "for AI coding agents, see CONTRIBUTING.md" pointer.

## 5. Git history

Removing a file from the working tree does **not** remove it from history.
Anyone can still read every past version of `RUN_LOG.md`, old configs, etc.

- [ ] Decide how to handle history. For a clean public start, either:
  - **squash to a single commit** on a fresh branch and publish that, or
  - start a brand-new repo and push the cleaned tree as the initial commit, or
  - use `git filter-repo` to strip specific paths from history.
- [ ] If any real secret ever touched history, **rotate it** regardless of
  history rewriting.

## 6. Untracked local scratch (now gitignored)

These directories are local-only and now in `.gitignore`; confirm they are not
accidentally added before publishing:

- `review/`, `batch-review/` — internal review notes
- `decisions/` (`decisions/stolen/`) — competitor/reference analysis; the folder
  name alone is a reputational risk. **Do not publish.**
- `openwiki/` — local wiki draft
- `repomix*.md` — AI context dumps

```bash
git status --porcelain --ignored | grep -E 'review/|batch-review/|decisions/|openwiki/|repomix'
```

## 7. GitHub repo setup

- [ ] Set the repo **description** and **topics** (e.g. `mcp`, `ai-agents`,
  `memory`, `claude-code`, `cursor`, `plugin`).
- [ ] Enable **Discussions** (the issue-template `config.yml` links to it).
- [ ] Add **branch protection** on `main` (require the CI check + a review).
- [ ] Confirm the CI workflow badge in `README.md` resolves once the repo is
  public.
- [ ] Verify all in-repo doc links resolve on GitHub (README → docs/install/*,
  CONTRIBUTING, SECURITY, LICENSE).

## 8. Final

- [ ] `pnpm check` is green.
- [ ] `git rm PRE_PUBLISH_CHECKLIST.md` (this file).
- [ ] Flip repository visibility to public.
