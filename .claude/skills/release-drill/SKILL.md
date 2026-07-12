---
name: release-drill
description: Pre-release drill for the Membase plugin — package every artifact locally, install each client (claude, codex, cursor, openclaw, hermes) through its real channel, verify auth, then prove skills AND hooks actually work end-to-end. Use before tagging a release, e.g. "/release-drill" or "/release-drill codex" for one client.
model: sonnet
---

# Membase Release Drill

Package → install → authenticate → verify skills → verify hooks, per client,
using the artifacts a real user would receive — never the working tree
directly. Run all five clients unless the user names one.

Ground rules:

- `$REPO` = this repo's absolute root. `$DRILL` = a scratch dir you create
  (e.g. `/tmp/membase-release-drill`). All built artifacts go in `$DRILL`.
- Evidence over green text: every VERIFY step names the exact observable
  (file mtime, backend search hit, skill list output). Report a table at the
  end: client × {install, auth, skills, hooks} with evidence.
- Auth is browser OAuth — you cannot complete it headless. CHECK auth state;
  when missing, give the user the exact login command and wait.
- Restore anything you disturb. The user's live setup (especially the
  OpenClaw gateway and the codex trust state) must survive the drill.
- If `pnpm check` or `pnpm test` is red at HEAD, stop and report — drilling a
  broken tree wastes everyone's time.

## Phase 0 — package everything

```bash
mkdir -p $DRILL
cd $REPO && pnpm check && pnpm test          # gates first
# openclaw (npm lineage): capture-core must be resolvable BEFORE the runtime
cd $REPO/packages/capture-core && pnpm pack --pack-destination $DRILL
cd $REPO/clients/openclaw/runtime && pnpm pack --pack-destination $DRILL
# hermes (PyPI lineage)
cd $REPO/clients/hermes/python && python3 -m build --outdir $DRILL
# membase-cli (npm)
cd ~/Desktop/membase/membase-cli && bun run build && npm pack --pack-destination $DRILL
```

Sanity on the tarballs (catches "files" allowlist regressions):
- runtime tarball contains `openclaw.plugin.json`, `index.ts`, `src/` WITHOUT
  `*.test.ts`; its package.json dependency on `@membase/capture-core` is an
  exact version (workspace:* rewritten), and that version equals the
  capture-core tarball's.
- wheel contains `wiki_project.py`, `current_date.py`, `plugin/plugin.yaml`
  (`unzip -l $DRILL/*.whl`).

## Phase 1+2 — install + auth, per client

Install matrix (local artifacts, no network registries):

| client   | command |
|----------|---------|
| claude   | `claude plugin marketplace add $REPO && claude plugin install membase@membase-plugins` |
| codex    | `npx -y plugins add $REPO -t codex -y && codex plugin add membase@personal` |
| cursor   | `npx -y plugins add $REPO -t cursor -y` (macOS: lands in Claude's plugin cache — that is expected, not a bug) |
| openclaw | local registry (see verdaccio setup below) → publish capture-core tgz, then the runtime tgz → `npm_config_registry=http://localhost:4873 openclaw plugins install @membase/openclaw-membase --force` |
| hermes   | `uv tool install $DRILL/hermes_membase-*-py3-none-any.whl --force && hermes-membase install --skip-login` (use `HERMES_HOME=$DRILL/hermes-home` to keep the drill isolated) |

Verdaccio setup (publish REQUIRES an authenticated user even with
`publish: $all` — learned the hard way):

```bash
cat > $DRILL/verdaccio.yaml <<'EOF'
storage: /tmp/membase-release-drill/verdaccio-storage
uplinks: { npmjs: { url: https://registry.npmjs.org/ } }
packages:
  '@membase/*': { access: $all, publish: $all }
  '**': { access: $all, publish: $all, proxy: npmjs }
auth: { htpasswd: { file: /tmp/membase-release-drill/htpasswd, max_users: 1000 } }
EOF
npx -y verdaccio --config $DRILL/verdaccio.yaml --listen 4873 &
# register a user via the legacy PUT API and capture the token:
curl -s -X PUT http://localhost:4873/-/user/org.couchdb.user:drilluser \
  -H "Content-Type: application/json" \
  -d '{"name":"drilluser","password":"drillpass123","type":"user"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])"
echo "//localhost:4873/:_authToken=<TOKEN>" > $DRILL/.npmrc-drill
npm publish --registry http://localhost:4873 --userconfig $DRILL/.npmrc-drill <tgz>
```

After the openclaw install, ALWAYS check which source is ACTIVE — a
pre-existing config-selected dev link silently wins over the npm install
(`openclaw plugins list` prints a "not the active source" warning). An
install that succeeded but is not active verifies packaging, not loading.

Or route everything through the CLI under test:
`node ~/Desktop/membase/membase-cli/bin/run --client <name>` — this
additionally exercises the routing, the codex identity registration, and the
codex hook-command repair. Prefer it for claude/codex/cursor; openclaw/hermes
need the local-artifact commands above until the packages are published.

Auth state checks (per-client hook credentials are separate from the
client's own MCP OAuth):

Claude auth MUST be checked with the plugin's own `get_status` tool (via the
`plugin:membase:membase` MCP server), not by assuming: a machine can have BOTH
the plugin's local stdio server AND a remote `mcp.membase.so` entry (from an
old membase-cli install). The remote one answering does NOT mean the plugin is
logged in — `get_status` reporting `logged_in: false` while recall "works"
means every request is riding the remote path and hook capture is dead. It
also self-reports `duplicate_remote_mcp_configs` — surface that to the user.

| client   | hook credentials at | login command when missing |
|----------|--------------------|----------------------------|
| claude   | `~/.claude/plugins/membase/credentials.json` | `/membase:login` inside Claude Code |
| codex    | `~/.membase/codex/credentials.json` | drive the bundled server's `login` tool (see `scripts` note below) or any prior scripted login |
| cursor   | `~/.claude/plugins/membase/…` (shared cache) | via Claude Code login |
| openclaw | `~/.openclaw/credentials/openclaw-membase.json` | `openclaw membase login` |
| hermes   | `$HERMES_HOME/credentials/membase.json` | `hermes-membase login` |

## Phase 3 — verify skills

- **claude**: `claude plugin list` shows membase enabled; ask a throwaway
  `claude -p` session to list skills and expect the membase skill names.
- **codex**: `codex exec --skip-git-repo-check "List every skill identifier
  starting with 'membase'"` → expect all 7 `membase:*` entries. If none:
  check `codex plugin list` shows `membase@personal` **installed, enabled**
  (the plugins-cli config key alone is NOT enough — known identity mismatch).
- **cursor**: skills ride the shared Claude cache; verify the cache path in
  `~/.claude/plugins/` contains `skills/`. Interactive check is manual.
- **openclaw**: `openclaw plugins list` shows the plugin enabled with 10
  tools; `openclaw membase --help` lists the CLI surface (search/add/wiki
  with `--project`).
- **hermes**: run the installed provider's tests against the wheel env, and
  `hermes-membase --help` exits 0.

## Phase 4 — verify hooks (the part everyone skips)

Codex trust gate: after ANY change to hook commands/matchers, handlers are
silently skipped until the user approves them in `/hooks`. Confirm with the
user that approval happened BEFORE interpreting a silent hook as a bug.

Evidence-based probes:

1. **Recall injection** (SessionStart/UserPromptSubmit): the model's
   self-report is NOT ground truth — a codex session has answered "NONE"
   while the hook was verifiably injecting a full `<membase-context>` block
   (2026-07-12, suspect: low reasoning effort). Verify in two layers:
   (a) ground truth — invoke the hook directly with the exact prompt payload
   and confirm the context block:
   ```bash
   echo '{"session_id":"probe","cwd":"'$REPO'","hook_event_name":"UserPromptSubmit","prompt":"<the question>"}' \
     | MEMBASE_CLIENT_SOURCE=codex node $REPO/hooks/hook.cjs UserPromptSubmit
   ```
   (b) model-level — ask a factual question whose answer only exists in
   memory. If (a) passes and (b) fails, file it as a host/model-layer issue,
   not a hook bug. When driving `codex exec` in the background, pipe the
   prompt via `printf '%s' "…" | codex exec … -` — an inherited-but-open
   stdin hangs the session on "Reading additional input from stdin...".
2. **Work capture** (PostToolUse/PostToolBatch digest): in a session, run a
   command that passes the "important" filter (e.g. `pnpm --version` does
   NOT — use `pnpm run build` or `git status` vs `git commit` semantics:
   only IMPORTANT_BASH_RE commands count). Then check
   `~/.membase/<client>/scratch/` gained a session file. Digest uploads on
   SessionEnd (claude) or the next SessionStart sweep after 30 min idle
   (codex exec sessions) — for a fast drill, verify the scratch file exists
   rather than waiting for the upload.
3. **Explicit memory e2e**: tell the client "remember: the release drill
   marker is <UNIQUE-MARKER>" → after the session, `search_memory` for the
   marker via this session's membase MCP tools (`sources=[<client>]`).
   This proves hook/tool → backend → search, end to end.
4. **Spool durability**: `~/.membase/<client>/spool/pending.jsonl` must be
   empty (0 bytes) after a successful run — nonempty means uploads are
   failing and being spooled.
5. **codex hook health**: the session output must show NO
   `hook (failed): exited with code 1` lines. Two async-skip warnings for
   Claude-only events are expected and fine. If exit-1 appears: check the
   installed plugin's `hooks/hooks.json` for `${CODEX_PLUGIN_ROOT}` — codex
   only substitutes `PLUGIN_ROOT`/`CLAUDE_PLUGIN_ROOT`; run the membase-cli
   codex route to repair, then re-approve `/hooks`.
6. **openclaw**: do NOT restart the live gateway rapidly (telegram session
   jam). Prefer `OPENCLAW_STATE_DIR=$DRILL/openclaw-state` isolation, or
   `bun test dream.e2e` in the runtime for the hook→spool→dream chain
   against a fake gateway.

## Phase 5 — report and cleanup

- Report the client × {install, auth, skills, hooks} matrix with one line of
  evidence per cell.
- Cleanup: kill verdaccio; `uv tool uninstall hermes-membase` if the user's
  machine had a different version; remove `$DRILL`; restore any config
  `.bak`; if the drill installed the plugin somewhere the user did not have
  it, offer to uninstall.

## Known traps (learned 2026-07-12, verify against current code)

- plugins-cli writes codex config key `membase@plugins-cli`; codex resolves
  `membase@personal` — without `codex plugin add membase@personal` the
  plugin is "not installed" and skills/hooks never load.
- plugins-cli rewrites hook commands to `${CODEX_PLUGIN_ROOT}` which codex
  does not substitute → every hook exits 1. The membase-cli codex route
  repairs this; a raw plugins-cli install does not.
- Skills are NOT slash commands in codex: `membase:membase-dream` is invoked
  by asking for it in prose, not `/membase:membase-dream`.
- Conversation text is never captured by design (summary mode = tool digests
  + Claude-only compact summaries). Do not file "chat not saved" as a bug.
- Cursor on macOS shares Claude's plugin cache; installing for cursor
  (re)installs the Claude plugin — expected.
- npm publishes need capture-core on the registry first; the publish
  workflow orders this, a manual `npm publish` of the runtime alone 404s.
