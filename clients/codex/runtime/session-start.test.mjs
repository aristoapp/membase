import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildHookOutput,
  handoffCandidates,
  readHandoff,
} from "./session-start.mjs";

const SCRIPT = fileURLToPath(new URL("./session-start.mjs", import.meta.url));

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "membase-handoff-"));
  const file = path.join(dir, "membase-handoff.md");
  fs.writeFileSync(file, content);
  return file;
}

test("env override wins over cwd/home candidates", () => {
  const candidates = handoffCandidates("/cwd", { MEMBASE_HANDOFF_FILE: "/x" });
  assert.deepEqual(candidates, ["/x"]);
});

test("defaults to project .codex then home .codex", () => {
  const candidates = handoffCandidates("/cwd", {}, "/home/u");
  assert.deepEqual(candidates, [
    path.join("/cwd", ".codex", "membase-handoff.md"),
    path.join("/home/u", ".codex", "membase-handoff.md"),
  ]);
});

test("readHandoff skips missing and empty files", () => {
  const empty = tmpFile("   \n");
  const filled = tmpFile("resume the migration");
  assert.equal(readHandoff(["/nope", empty, filled]), "resume the migration");
  assert.equal(readHandoff(["/nope", empty]), "");
});

test("buildHookOutput emits the Codex SessionStart schema", () => {
  const parsed = JSON.parse(buildHookOutput("hello"));
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(
    parsed.hookSpecificOutput.additionalContext,
    "<membase-handoff>\nhello\n</membase-handoff>",
  );
  assert.equal(buildHookOutput(""), "");
});

test("end to end: stdin cwd + handoff file -> additionalContext", () => {
  const file = tmpFile("[HANDOFF] finish the docs PR");
  const stdout = execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ cwd: "/nowhere" }),
    env: { ...process.env, MEMBASE_HANDOFF_FILE: file },
    encoding: "utf8",
  });
  const parsed = JSON.parse(stdout);
  assert.match(
    parsed.hookSpecificOutput.additionalContext,
    /\[HANDOFF\] finish the docs PR/,
  );
});

test("end to end: no handoff file -> no output", () => {
  const stdout = execFileSync(process.execPath, [SCRIPT], {
    input: "{}",
    env: { ...process.env, MEMBASE_HANDOFF_FILE: "/does/not/exist" },
    encoding: "utf8",
  });
  assert.equal(stdout, "");
});
