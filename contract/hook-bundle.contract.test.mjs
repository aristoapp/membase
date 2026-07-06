// Contracts: C-HOOK-1..6 (contract/spec.md "Shared hook bundle" section).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  CLAUDE_HOOK,
  CURSOR_HOOK,
  CODEX_SESSION_START,
  makeDataDir,
  runEntry,
  readSpool,
  readSpoolRaw,
  startStubApi,
  writeConfig,
  writeCredentials,
  writeSpool,
  sleep,
} from "./helpers.mjs";

const codexPostToolUse = JSON.stringify({
  tool_name: "apply_patch",
  tool_input: { command: "*** Update File: x.ts" },
});

test("C-HOOK-1 SessionStart with no credentials + non-empty spool announces pending captures and add_memory", async (t) => {
  const dir = await makeDataDir(t);
  await writeSpool(dir, [
    { content: "pending capture one, long enough to be a real record" },
    { content: "pending capture two, long enough to be a real record" },
    { content: "pending capture three, long enough to be a real record" },
  ]);
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  const out = JSON.parse(run.stdout);
  const ctx = out.hookSpecificOutput?.additionalContext;
  assert.equal(typeof ctx, "string", "additionalContext must be a string");
  assert.match(ctx, /\b3\b/, "must mention the number of pending captures");
  assert.match(ctx, /add_memory/, "must instruct storing via add_memory");
});

test("C-HOOK-2 PostToolUse with Codex-shaped apply_patch payload spools a summary naming the file, no network", async (t) => {
  const dir = await makeDataDir(t);
  const api = await startStubApi(t);
  // apiUrl configured but NO credentials — nothing may leave the machine.
  await writeConfig(dir, { apiUrl: api.url });
  const run = await runEntry(CLAUDE_HOOK, ["PostToolUse"], {
    input: codexPostToolUse,
    env: {
      MEMBASE_DATA_DIR: dir,
      CLAUDE_PLUGIN_OPTION_captureMode: "summary",
    },
  });
  assert.equal(run.code, 0);
  const records = readSpool(dir);
  assert.equal(records.length, 1, "exactly one summary record expected");
  const flat = JSON.stringify(records[0]);
  assert.ok(flat.includes("x.ts"), `summary must name the touched file: ${flat}`);
  await sleep(300); // give any stray async request time to land
  assert.equal(
    api.requests.length,
    0,
    `no network without credentials; saw ${JSON.stringify(api.requests.map((r) => r.url))}`,
  );
});

test("C-HOOK-3 MEMBASE_CLIENT_SOURCE=codex attributes the spooled summary to Codex, not Claude Code", async (t) => {
  const dir = await makeDataDir(t);
  const run = await runEntry(CLAUDE_HOOK, ["PostToolUse"], {
    input: codexPostToolUse,
    env: {
      MEMBASE_DATA_DIR: dir,
      MEMBASE_CLIENT_SOURCE: "codex",
      CLAUDE_PLUGIN_OPTION_captureMode: "summary",
    },
  });
  assert.equal(run.code, 0);
  const [record] = readSpool(dir);
  assert.ok(record, "a summary record must be spooled");
  const visible = `${record.content}\n${record.display_summary ?? ""}`;
  assert.match(visible, /codex/i, `summary must identify Codex: ${visible}`);
  assert.ok(
    !/claude code/i.test(visible),
    `summary must not claim Claude Code: ${visible}`,
  );
});

test("C-HOOK-3 with MEMBASE_CLIENT_SOURCE unset, upload requests identify claude-code", async (t) => {
  const dir = await makeDataDir(t);
  const api = await startStubApi(t);
  await writeConfig(dir, { apiUrl: api.url });
  await writeCredentials(dir);
  await writeSpool(dir, [
    { content: "attribution probe record long enough to survive filters" },
  ]);
  const run = await runEntry(CLAUDE_HOOK, ["Stop"], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: "s-attr" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  const ingests = api.ingestRequests();
  assert.ok(ingests.length >= 1, "Stop must flush the pending record");
  assert.equal(ingests[0].json?.source, "claude-code");
});

test("C-HOOK-4 config captureMode:'off' beats env captureMode=summary — nothing spooled", async (t) => {
  const dir = await makeDataDir(t);
  await writeConfig(dir, { captureMode: "off" });
  const run = await runEntry(CLAUDE_HOOK, ["PostToolUse"], {
    input: codexPostToolUse,
    env: {
      MEMBASE_DATA_DIR: dir,
      CLAUDE_PLUGIN_OPTION_captureMode: "summary",
    },
  });
  assert.equal(run.code, 0);
  assert.equal(
    readSpoolRaw(dir),
    "",
    "explicit user off on disk must win over the env default",
  );
});

test("C-HOOK-5 Stop flushes pending records as authenticated POSTs carrying source", async (t) => {
  const dir = await makeDataDir(t);
  const api = await startStubApi(t);
  await writeConfig(dir, { apiUrl: api.url });
  const creds = await writeCredentials(dir);
  await writeSpool(dir, [
    { content: "flush record alpha with sufficient length for capture" },
    { content: "flush record beta with sufficient length for capture" },
  ]);
  const run = await runEntry(CLAUDE_HOOK, ["Stop"], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: "s-flush" }),
    env: { MEMBASE_DATA_DIR: dir, MEMBASE_CLIENT_SOURCE: "codex" },
  });
  assert.equal(run.code, 0);
  const ingests = api.ingestRequests();
  assert.equal(ingests.length, 2, `expected 2 ingests, got ${ingests.length}`);
  for (const req of ingests) {
    assert.equal(req.auth, `Bearer ${creds.accessToken}`);
    assert.equal(req.json?.source, "codex", "body.source must be the client source");
    assert.equal(typeof req.json?.content, "string");
  }
  assert.equal(readSpool(dir).length, 0, "flushed records must leave the spool");
});

test("C-HOOK-5 SessionStart flushes at most 1 pending record", async (t) => {
  const dir = await makeDataDir(t);
  const api = await startStubApi(t);
  await writeConfig(dir, { apiUrl: api.url });
  await writeCredentials(dir);
  await writeSpool(dir, [
    { content: "session-start flush candidate one, adequately long" },
    { content: "session-start flush candidate two, adequately long" },
    { content: "session-start flush candidate three, adequately long" },
  ]);
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  assert.ok(
    api.ingestRequests().length <= 1,
    `SessionStart flushed ${api.ingestRequests().length} records; contract says at most 1`,
  );
  assert.ok(readSpool(dir).length >= 2, "the other records must remain spooled");
});

test("C-HOOK-5 on 401 the runtime refreshes via POST /oauth/token exactly once and retries", async (t) => {
  const dir = await makeDataDir(t);
  const api = await startStubApi(t, { ingest: "unauthorized-once" });
  await writeConfig(dir, { apiUrl: api.url });
  await writeCredentials(dir, { accessToken: "stale-access-token" });
  await writeSpool(dir, [
    { content: "refresh-retry probe record long enough for the filters" },
  ]);
  const run = await runEntry(CLAUDE_HOOK, ["Stop"], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: "s-401" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  assert.equal(
    api.tokenRequests().length,
    1,
    `exactly one /oauth/token call expected, saw ${api.tokenRequests().length}`,
  );
  const ingests = api.ingestRequests();
  assert.equal(ingests.length, 2, "401 then a single retry");
  assert.equal(ingests[0].auth, "Bearer stale-access-token");
  assert.equal(
    ingests[1].auth,
    "Bearer refreshed-token-1",
    "retry must carry the refreshed access token",
  );
  assert.equal(readSpool(dir).length, 0, "record must be uploaded after retry");
});

// C-HOOK-6 — fail-open: garbage stdin never blocks or crashes the host.
const DEADLINE_MS = 5000;
const entryPoints = [
  ["hook.cjs SessionStart", CLAUDE_HOOK, ["SessionStart"]],
  ["cursor-hook.mjs sessionStart", CURSOR_HOOK, ["sessionStart"]],
  ["session-start.mjs", CODEX_SESSION_START, []],
];
const garbageInputs = [
  ["invalid JSON", "this is {{{ not json at all"],
  ["binary garbage", randomBytes(1024 * 1024)],
  ["huge stdin", Buffer.alloc(8 * 1024 * 1024, "x")],
];

for (const [entryName, script, args] of entryPoints) {
  for (const [inputName, input] of garbageInputs) {
    test(`C-HOOK-6 ${entryName} exits 0 within 5s on ${inputName}`, async (t) => {
      const dir = await makeDataDir(t);
      const run = await runEntry(script, args, {
        input,
        env: { MEMBASE_DATA_DIR: dir },
        timeoutMs: DEADLINE_MS + 1000,
      });
      assert.equal(run.timedOut, false, "entry point hung past the deadline");
      assert.equal(run.code, 0, `exit ${run.code}; stderr: ${run.stderr.slice(0, 300)}`);
      assert.ok(
        run.durationMs < DEADLINE_MS,
        `took ${run.durationMs}ms (>= ${DEADLINE_MS}ms)`,
      );
    });
  }

  test(`C-HOOK-6 ${entryName} exits 0 within 5s with stdin held open`, async (t) => {
    const dir = await makeDataDir(t);
    const run = await runEntry(script, args, {
      input: JSON.stringify({ hook_event_name: "SessionStart" }),
      holdStdinOpen: true,
      env: { MEMBASE_DATA_DIR: dir },
      timeoutMs: DEADLINE_MS + 1000,
    });
    assert.equal(run.timedOut, false, "entry point hung waiting on open stdin");
    assert.equal(run.code, 0, `exit ${run.code}; stderr: ${run.stderr.slice(0, 300)}`);
    assert.ok(
      run.durationMs < DEADLINE_MS,
      `took ${run.durationMs}ms (>= ${DEADLINE_MS}ms)`,
    );
  });
}

test("C-HOOK-7 stdout is a single JSON document (no-creds SessionStart)", async (t) => {
  const dir = await makeDataDir(t);
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  if (run.stdout.trim()) {
    JSON.parse(run.stdout); // throws if two objects are concatenated
  }
});
