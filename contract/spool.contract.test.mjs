// Contracts: C-SPOOL-1..5 (contract/spec.md "Spool" section). Blind tests —
// written from the spec only; exercised via public entry points and the
// built @membase/capture-core package.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  CLAUDE_HOOK,
  loadCaptureCore,
  captureCoreDistUrl,
  makeDataDir,
  runEntry,
  readSpool,
  readSpoolRaw,
  readScratch,
  startStubApi,
  writeConfig,
  writeCredentials,
  writeSpool,
} from "./helpers.mjs";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// SPEC-AMBIGUITY: the spec names the factory exports but not their option
// shapes. Black-box probing found createCaptureSpool requires
// { stateDir: () => dir, sanitize: (text) => text }. Tests inject
// redactSecrets as sanitize — the pairing the "secret redaction before the
// line is written" promise implies.
async function makeSpool(core, dir, sanitize) {
  return core.createCaptureSpool({
    stateDir: () => dir,
    sanitize: sanitize ?? ((text) => core.redactSecrets(text)),
  });
}

test("C-SPOOL-1 pending.jsonl is JSON-Lines of SpoolRecord-shaped objects (session digest + capture-core)", async (t) => {
  // via public hook entry point: a tool call + SessionEnd produces one digest.
  const dir = await makeDataDir(t);
  await runEntry(CLAUDE_HOOK, ["PostToolUse"], {
    input: JSON.stringify({
      session_id: "s-spool1",
      tool_name: "apply_patch",
      tool_input: { command: "*** Update File: contract-spool-one.ts" },
    }),
    env: {
      MEMBASE_DATA_DIR: dir,
      MEMBASE_CLIENT_SOURCE: "codex",
      CLAUDE_PLUGIN_OPTION_captureMode: "summary",
    },
  });
  const end = await runEntry(CLAUDE_HOOK, ["SessionEnd"], {
    input: JSON.stringify({ hook_event_name: "SessionEnd", session_id: "s-spool1" }),
    env: { MEMBASE_DATA_DIR: dir, CLAUDE_PLUGIN_OPTION_captureMode: "summary" },
  });
  assert.equal(end.code, 0);

  // via capture-core
  const core = await loadCaptureCore();
  const spool = await makeSpool(core, dir);
  await spool.enqueueCapture({
    capture_kind: "note",
    content: "a second record long enough to clear any minimum length gate",
  });

  const records = readSpool(dir);
  assert.ok(records.length >= 2, `expected >=2 records, got ${records.length}`);
  for (const rec of records) {
    assert.equal(typeof rec.capture_id, "string");
    assert.ok(rec.capture_id.length > 0);
    assert.equal(typeof rec.capture_kind, "string");
    assert.equal(typeof rec.content, "string");
    assert.equal(typeof rec.created_at, "string");
    assert.match(rec.created_at, ISO_RE, "created_at must be an ISO timestamp");
  }
});

test("C-SPOOL-2 secret value never reaches disk (hook entry point → scratch)", async (t) => {
  const dir = await makeDataDir(t);
  const run = await runEntry(CLAUDE_HOOK, ["PostToolUse"], {
    input: JSON.stringify({
      session_id: "s-secret",
      tool_name: "Bash",
      tool_input: {
        command: "export API_KEY=dummyvalue123 && ./deploy.sh --env prod",
      },
    }),
    env: {
      MEMBASE_DATA_DIR: dir,
      MEMBASE_CLIENT_SOURCE: "codex",
      CLAUDE_PLUGIN_OPTION_captureMode: "summary",
    },
  });
  assert.equal(run.code, 0);
  // Tool observations now land in scratch (not the spool) mid-session; a
  // secret-bearing command must not survive to either.
  assert.ok(
    !readSpoolRaw(dir).includes("dummyvalue123"),
    "secret value must never appear in the spool file",
  );
  assert.ok(
    !JSON.stringify(readScratch(dir, "s-secret")).includes("dummyvalue123"),
    "secret value must never appear in the scratch file",
  );
});

test("C-SPOOL-2 redactSecrets strips a secret assignment before write (capture-core)", async (t) => {
  const core = await loadCaptureCore();
  const redacted = core.redactSecrets(
    "config line API_KEY=dummyvalue123 plus surrounding context text",
  );
  assert.ok(
    !redacted.includes("dummyvalue123"),
    `redactSecrets left the secret intact: ${redacted}`,
  );
  const dir = await makeDataDir(t);
  const spool = await makeSpool(core, dir);
  await spool.enqueueCapture({
    capture_kind: "note",
    content:
      "deployment used API_KEY=dummyvalue123 for the staging environment today",
  });
  assert.ok(
    !readSpoolRaw(dir).includes("dummyvalue123"),
    "secret survived sanitize-before-write",
  );
});

test("C-SPOOL-3 truncate-after-upload: flushed records are gone and same content is not re-spooled", async (t) => {
  const core = await loadCaptureCore();
  const dir = await makeDataDir(t);
  const spool = await makeSpool(core, dir);
  const content =
    "unique content for the truncate-after-upload round trip check";
  await spool.enqueueCapture({ capture_kind: "note", content });
  assert.equal(await spool.pendingSpoolCount(), 1);

  const uploaded = [];
  const res = await spool.flushSpool(async (rec) => {
    uploaded.push(rec);
    return true;
  });
  assert.equal(uploaded.length, 1);
  assert.equal(res.remaining, 0);
  assert.equal(readSpool(dir).length, 0, "uploaded record must leave the file");

  // "missing from cloud" ≡ "still in the spool": same content must NOT create
  // a new record after a successful upload.
  await spool.enqueueCapture({ capture_kind: "note", content });
  assert.equal(
    await spool.pendingSpoolCount(),
    0,
    "re-enqueueing already-uploaded content must not create a new record",
  );
});

test("C-SPOOL-4 403 on every ingest loses nothing (hook Stop against quota stub)", async (t) => {
  const dir = await makeDataDir(t);
  const api = await startStubApi(t, { ingest: "quota403" });
  await writeConfig(dir, { apiUrl: api.url });
  await writeCredentials(dir);
  await writeSpool(dir, [
    { content: "quota probe record one with plenty of characters in it" },
    { content: "quota probe record two with plenty of characters in it" },
  ]);

  const run = await runEntry(CLAUDE_HOOK, ["Stop"], {
    input: JSON.stringify({ hook_event_name: "Stop", session_id: "s-quota" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  assert.ok(api.ingestRequests().length >= 1, "flush must have been attempted");
  const remaining = readSpool(dir);
  assert.equal(
    remaining.length,
    2,
    `records must survive a 403-only API; ${remaining.length} left`,
  );
});

test("C-SPOOL-4 failed uploader keeps records (capture-core)", async (t) => {
  const core = await loadCaptureCore();
  const dir = await makeDataDir(t);
  const spool = await makeSpool(core, dir);
  await spool.enqueueCapture({
    capture_kind: "note",
    content: "record that must survive an uploader that always fails hard",
  });
  await spool.flushSpool(async () => {
    throw new Error("network down");
  });
  assert.equal(
    await spool.pendingSpoolCount(),
    1,
    "a failing upload must leave the record in the spool",
  );
  // SPEC-AMBIGUITY: the uploader callback protocol is not in the spec.
  // Observed black-box: throwing keeps the record (failure), while RETURNING
  // false removes it as "flushed". If any caller signals a failed upload by
  // returning false rather than throwing, records are silently dropped —
  // flagged as an observation, not asserted, since the spec never defines
  // the callback's false semantics.
});

test("C-SPOOL-5 two processes enqueueing concurrently never corrupt the file", async (t) => {
  const core = await loadCaptureCore(); // ensures dist exists for children
  assert.ok(core.createCaptureSpool);
  const dir = await makeDataDir(t);
  const perChild = 20;
  const childScript = join(dir, "enqueue-child.mjs");
  await writeFile(
    childScript,
    `
const core = await import(${JSON.stringify(captureCoreDistUrl())});
const spool = core.createCaptureSpool({
  stateDir: () => ${JSON.stringify(dir)},
  sanitize: (t) => t,
});
const prefix = process.argv[2];
for (let i = 0; i < ${perChild}; i++) {
  await spool.enqueueCapture({
    capture_kind: "note",
    content: "concurrent capture " + prefix + " number " + i + " padded out to a safe length",
  });
}
`,
  );
  const runChild = (prefix) =>
    new Promise((resolveChild, rejectChild) => {
      const c = spawn(process.execPath, [childScript, prefix], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      c.stderr.on("data", (d) => (err += d));
      c.on("close", (code) =>
        code === 0
          ? resolveChild()
          : rejectChild(new Error(`child ${prefix} exited ${code}: ${err}`)),
      );
    });
  await Promise.all([runChild("alpha"), runChild("beta")]);

  const records = readSpool(dir); // readSpool throws if any line is corrupt
  assert.equal(
    records.length,
    perChild * 2,
    `lost records under concurrency: ${records.length}/${perChild * 2}`,
  );
  const contents = new Set(records.map((r) => r.content));
  assert.equal(contents.size, perChild * 2, "duplicate/overwritten records");
});
