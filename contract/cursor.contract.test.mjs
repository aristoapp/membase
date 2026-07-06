// Contracts: C-CUR-1..4 (contract/spec.md "Cursor adapter" section).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_HOOK,
  makeDataDir,
  runEntry,
  readSpool,
  readSpoolRaw,
} from "./helpers.mjs";

test("C-CUR-1 sessionStart stdout is empty or exactly one {additional_context: string} object", async (t) => {
  const dir = await makeDataDir(t);
  const run = await runEntry(CURSOR_HOOK, ["sessionStart"], {
    input: JSON.stringify({
      conversation_id: "conv-1",
      workspace_roots: ["/tmp"],
    }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  const out = run.stdout.trim();
  if (out !== "") {
    const parsed = JSON.parse(out); // must be exactly one JSON object
    assert.equal(
      typeof parsed.additional_context,
      "string",
      `expected {"additional_context": string}, got: ${out.slice(0, 200)}`,
    );
    assert.ok(
      !("hookSpecificOutput" in parsed),
      "must NEVER use the Claude hookSpecificOutput shape",
    );
  }
});

test("C-CUR-2 afterFileEdit spools a record referencing the file; stdout empty", async (t) => {
  const dir = await makeDataDir(t);
  const run = await runEntry(CURSOR_HOOK, ["afterFileEdit"], {
    input: JSON.stringify({
      conversation_id: "conv-2",
      workspace_roots: ["/tmp"],
      file_path: "/tmp/proj/lib/widget.ts",
    }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  assert.equal(run.stdout.trim(), "", "afterFileEdit must print nothing");
  const records = readSpool(dir);
  assert.equal(records.length, 1);
  assert.ok(
    JSON.stringify(records[0]).includes("widget.ts"),
    `record must reference the edited file: ${JSON.stringify(records[0]).slice(0, 200)}`,
  );
});

test("C-CUR-3 afterShellExecution spools 'pnpm build' but filters trivial 'ls'", async (t) => {
  const dir = await makeDataDir(t);
  const base = {
    conversation_id: "conv-3",
    workspace_roots: ["/tmp"],
  };
  let run = await runEntry(CURSOR_HOOK, ["afterShellExecution"], {
    input: JSON.stringify({ ...base, command: "pnpm build" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  assert.equal(run.stdout.trim(), "");
  const afterBuild = readSpool(dir);
  assert.equal(afterBuild.length, 1, "'pnpm build' must be summarized");
  assert.ok(
    JSON.stringify(afterBuild[0]).includes("pnpm build"),
    "summary must carry the command",
  );

  run = await runEntry(CURSOR_HOOK, ["afterShellExecution"], {
    input: JSON.stringify({ ...base, command: "ls" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  assert.equal(
    readSpool(dir).length,
    1,
    "trivial read-only 'ls' must spool nothing — capture is summaries, not a keylog",
  );
});

test("C-CUR-4 unknown events are silent no-ops with exit 0", async (t) => {
  const dir = await makeDataDir(t);
  for (const event of ["totallyMadeUpEvent", "beforeQuantumMerge", ""]) {
    const run = await runEntry(CURSOR_HOOK, [event], {
      input: JSON.stringify({ conversation_id: "conv-4", anything: true }),
      env: { MEMBASE_DATA_DIR: dir },
    });
    assert.equal(run.code, 0, `event "${event}" exited ${run.code}`);
    assert.equal(run.stdout.trim(), "", `event "${event}" printed output`);
    assert.equal(readSpoolRaw(dir), "", `event "${event}" wrote to the spool`);
  }
});
