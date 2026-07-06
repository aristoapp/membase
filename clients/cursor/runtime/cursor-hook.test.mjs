import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { EVENT_MAP, mapCursorInput } from "./cursor-hook.mjs";

const SCRIPT = fileURLToPath(new URL("./cursor-hook.mjs", import.meta.url));

test("event map covers the capture surface and session lifecycle", () => {
  assert.equal(EVENT_MAP.afterFileEdit, "PostToolUse");
  assert.equal(EVENT_MAP.afterShellExecution, "PostToolUse");
  assert.equal(EVENT_MAP.stop, "Stop");
  assert.equal(EVENT_MAP.sessionStart, "SessionStart");
  assert.equal(EVENT_MAP.sessionEnd, "SessionEnd");
  // Cursor has no context-injection output for beforeSubmitPrompt, so a
  // recall fetch there would be pure latency — the event must stay unmapped.
  assert.equal("beforeSubmitPrompt" in EVENT_MAP, false);
});

test("afterFileEdit maps to an Edit tool call", () => {
  const mapped = mapCursorInput("afterFileEdit", {
    conversation_id: "c1",
    workspace_roots: ["/repo"],
    file_path: "/repo/src/a.ts",
  });
  assert.equal(mapped.session_id, "c1");
  assert.equal(mapped.cwd, "/repo");
  assert.deepEqual(
    { name: mapped.tool_name, input: mapped.tool_input },
    { name: "Edit", input: { file_path: "/repo/src/a.ts" } },
  );
});

test("afterShellExecution maps command from either payload shape", () => {
  assert.equal(
    mapCursorInput("afterShellExecution", { command: "pnpm build" })
      .tool_input.command,
    "pnpm build",
  );
  assert.equal(
    mapCursorInput("afterShellExecution", {
      tool_input: { command: "pnpm test" },
    }).tool_input.command,
    "pnpm test",
  );
});

test("end to end: afterFileEdit lands in the spool via the shared bundle", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-capture-"));
  execFileSync(process.execPath, [SCRIPT, "afterFileEdit"], {
    input: JSON.stringify({
      conversation_id: "c1",
      workspace_roots: [os.tmpdir()],
      file_path: "/repo/src/feature.ts",
    }),
    env: { ...process.env, MEMBASE_DATA_DIR: dataDir },
    encoding: "utf8",
  });
  const pending = fs.readFileSync(
    path.join(dataDir, "spool", "pending.jsonl"),
    "utf8",
  );
  assert.match(pending, /Cursor tool summary/);
  assert.match(pending, /src\/feature\.ts/);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Run the adapter against a fake bundle script and return its stdout. */
function runWithFakeBundle(event, bundleSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-fake-bundle-"));
  const fakeBundle = path.join(dir, "fake-hook.cjs");
  fs.writeFileSync(fakeBundle, bundleSource);
  try {
    return execFileSync(process.execPath, [SCRIPT, event], {
      input: JSON.stringify({
        conversation_id: "c1",
        workspace_roots: ["/tmp"],
      }),
      env: { ...process.env, MEMBASE_HOOK_BUNDLE: fakeBundle },
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const claudeShapedOutput = (hookEventName, additionalContext) =>
  `process.stdout.write(JSON.stringify({
    hookSpecificOutput: ${JSON.stringify({ hookEventName, additionalContext })},
  }));`;

test("end to end: sessionStart translates bundle output to Cursor's schema", () => {
  const out = runWithFakeBundle(
    "sessionStart",
    claudeShapedOutput("SessionStart", "hello from membase"),
  );
  assert.equal(out, '{"additional_context":"hello from membase"}');
});

test("end to end: non-sessionStart events never print to stdout", () => {
  const out = runWithFakeBundle(
    "sessionEnd",
    claudeShapedOutput("SessionEnd", "should be dropped"),
  );
  assert.equal(out, "");
});

test("end to end: malformed bundle output on sessionStart prints nothing", () => {
  const out = runWithFakeBundle(
    "sessionStart",
    `process.stdout.write("not json");`,
  );
  assert.equal(out, "");
});

test("end to end: unknown event is a silent no-op", () => {
  const out = execFileSync(process.execPath, [SCRIPT, "somethingElse"], {
    input: "{}",
    encoding: "utf8",
  });
  assert.equal(out, "");
});
