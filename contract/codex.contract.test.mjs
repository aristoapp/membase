// Contracts: C-CDX-1..3 (contract/spec.md "Codex handoff recall" section).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, symlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  CODEX_SESSION_START,
  makeDataDir,
  runEntry,
} from "./helpers.mjs";

const HANDOFF_TEXT =
  "[HANDOFF] resume the dashboard rewrite at step 3; auth flow is done";

test("C-CDX-1 non-empty MEMBASE_HANDOFF_FILE is injected as SessionStart additionalContext", async (t) => {
  const dir = await makeDataDir(t);
  const handoffFile = join(dir, "handoff.md");
  await writeFile(handoffFile, HANDOFF_TEXT);
  const run = await runEntry(CODEX_SESSION_START, [], {
    input: JSON.stringify({}),
    env: { MEMBASE_HANDOFF_FILE: handoffFile, MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  const out = JSON.parse(run.stdout);
  assert.equal(out.hookSpecificOutput?.hookEventName, "SessionStart");
  assert.ok(
    out.hookSpecificOutput?.additionalContext?.includes(HANDOFF_TEXT),
    `additionalContext must contain the file text: ${run.stdout.slice(0, 300)}`,
  );
});

test("C-CDX-2 missing handoff file: no stdout, exit 0", async (t) => {
  const dir = await makeDataDir(t);
  const run = await runEntry(CODEX_SESSION_START, [], {
    input: JSON.stringify({}),
    env: {
      MEMBASE_HANDOFF_FILE: join(dir, "does-not-exist.md"),
      MEMBASE_DATA_DIR: dir,
    },
  });
  assert.equal(run.code, 0);
  assert.equal(run.stdout, "", "missing file must produce no stdout");
});

test("C-CDX-2 empty handoff file: no stdout, exit 0", async (t) => {
  const dir = await makeDataDir(t);
  const handoffFile = join(dir, "empty.md");
  await writeFile(handoffFile, "");
  const run = await runEntry(CODEX_SESSION_START, [], {
    input: JSON.stringify({}),
    env: { MEMBASE_HANDOFF_FILE: handoffFile, MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  assert.equal(run.stdout, "", "empty file must produce no stdout");
});

test("C-CDX-3 invoked via a symlinked path, behavior is identical", async (t) => {
  const dir = await makeDataDir(t);
  const handoffFile = join(dir, "handoff.md");
  await writeFile(handoffFile, HANDOFF_TEXT);
  const linkDir = join(dir, "dotfiles", "hooks");
  await mkdir(linkDir, { recursive: true });
  const link = join(linkDir, "membase-session-start.mjs");
  await symlink(CODEX_SESSION_START, link);

  const direct = await runEntry(CODEX_SESSION_START, [], {
    input: JSON.stringify({}),
    env: { MEMBASE_HANDOFF_FILE: handoffFile, MEMBASE_DATA_DIR: dir },
  });
  // run the symlink from an unrelated cwd, like a dotfiles setup would
  const linked = await runEntry(link, [], {
    input: JSON.stringify({}),
    env: { MEMBASE_HANDOFF_FILE: handoffFile, MEMBASE_DATA_DIR: dir },
    cwd: dir,
  });
  assert.equal(linked.code, 0, `symlinked run exited ${linked.code}: ${linked.stderr.slice(0, 300)}`);
  assert.equal(linked.stdout, direct.stdout, "output must be identical via symlink");
});
