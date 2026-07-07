// Contracts: C-CDX-1..3 (contract/spec.md "Codex handoff recall" section).
// Served by the shared hook bundle with MEMBASE_CLIENT_SOURCE=codex — the
// standalone session-start script was removed when file-first injection
// moved into the bundle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_HOOK, makeDataDir, runEntry } from "./helpers.mjs";

const HANDOFF_TEXT =
  "[HANDOFF] resume the dashboard rewrite at step 3; auth flow is done";

function codexEnv(dir, handoffFile) {
  return {
    MEMBASE_DATA_DIR: dir,
    MEMBASE_CLIENT_SOURCE: "codex",
    MEMBASE_HANDOFF_FILE: handoffFile,
  };
}

test("C-CDX-1 fresh handoff file is injected with stored_at framing (single JSON)", async (t) => {
  const dir = await makeDataDir(t);
  const handoffFile = join(dir, "handoff.md");
  await writeFile(handoffFile, HANDOFF_TEXT);
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart" }),
    env: codexEnv(dir, handoffFile),
  });
  assert.equal(run.code, 0);
  const out = JSON.parse(run.stdout); // single-document stdout (C-HOOK-7)
  const ctx = out.hookSpecificOutput?.additionalContext ?? "";
  assert.ok(
    ctx.includes(HANDOFF_TEXT),
    `additionalContext must contain the file text: ${run.stdout.slice(0, 300)}`,
  );
  assert.match(ctx, /<membase-handoff stored_at="/);
});

test("C-CDX-2 missing or empty handoff file injects no handoff block", async (t) => {
  const dir = await makeDataDir(t);
  const missing = join(dir, "nope.md");
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart" }),
    env: codexEnv(dir, missing),
  });
  assert.equal(run.code, 0);
  if (run.stdout.trim()) {
    const ctx =
      JSON.parse(run.stdout).hookSpecificOutput?.additionalContext ?? "";
    assert.ok(!ctx.includes("<membase-handoff"), "no handoff block expected");
  }
});

test("C-CDX-3 stale handoff file (mtime > 7 days) is announced, not injected", async (t) => {
  const dir = await makeDataDir(t);
  const handoffFile = join(dir, "handoff.md");
  await writeFile(handoffFile, HANDOFF_TEXT);
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
  await utimes(handoffFile, eightDaysAgo, eightDaysAgo);
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart" }),
    env: codexEnv(dir, handoffFile),
  });
  assert.equal(run.code, 0);
  const ctx =
    JSON.parse(run.stdout).hookSpecificOutput?.additionalContext ?? "";
  assert.ok(!ctx.includes(HANDOFF_TEXT), "stale body must not be injected");
  assert.match(ctx, /handoff from \d+ day\(s\) ago exists/);
});
