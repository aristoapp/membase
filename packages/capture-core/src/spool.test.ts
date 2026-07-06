// Package-level contract tests for the disk capture spool. The Claude
// runtime has its own integration tests; these pin the behaviors every
// spool consumer (Claude today, Cursor/Codex adapters per north-star
// pillar 1) relies on — most importantly: a failed upload (e.g. quota 403)
// must never lose the capture.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCaptureSpool, redactSecrets, type SpoolRecord } from "./index";

const dirs: string[] = [];

function makeSpool(sanitize: (text: string) => string = redactSecrets) {
  const dir = mkdtempSync(join(tmpdir(), "capture-spool-"));
  dirs.push(dir);
  const spool = createCaptureSpool({ stateDir: () => dir, sanitize });
  return { spool, dir };
}

function enqueue(spool: ReturnType<typeof makeSpool>["spool"], content: string) {
  return spool.enqueueCapture({
    capture_kind: "tool_summary",
    content,
    metadata: {},
    sessionId: "s1",
  });
}

afterEach(() => {
  while (dirs.length) {
    rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe("capture spool contract", () => {
  test("sanitize runs BEFORE the record hits disk", () => {
    const { spool, dir } = makeSpool();
    enqueue(spool, "deploy done, note OPENAI_API_KEY=dummy12345 in env somewhere");
    const raw = readFileSync(join(dir, "spool", "pending.jsonl"), "utf-8");
    expect(raw).not.toContain("dummy12345");
    expect(raw).toContain("[REDACTED]");
  });

  test("failed send (quota 403) keeps the record with attempts/last_error", async () => {
    const { spool } = makeSpool();
    enqueue(spool, "a capture that must survive quota exhaustion end to end");
    const result = await spool.flushSpool(async () => {
      throw new Error("Memory quota reached (403)");
    });
    expect(result.flushed).toBe(0);
    expect(result.remaining).toBe(1);
    // Second flush sees the same record again, with the failure recorded.
    let seen: SpoolRecord | undefined;
    await spool.flushSpool(async (record) => {
      seen = record;
    });
    expect(seen?.attempts).toBe(1);
    expect(seen?.last_error).toContain("403");
    expect(spool.pendingSpoolCount()).toBe(0);
  });

  test("successful flush truncates and the sent ledger blocks re-enqueue", async () => {
    const { spool } = makeSpool();
    const stored = enqueue(spool, "we decided to use postgres for the queue");
    expect(stored).not.toBeNull();
    const result = await spool.flushSpool(async () => {});
    expect(result).toEqual({ flushed: 1, remaining: 0 });
    // Same content again → deduped by the sent-id ledger.
    expect(enqueue(spool, "we decided to use postgres for the queue")).toBeNull();
    expect(spool.pendingSpoolCount()).toBe(0);
  });

  test("pendingSpoolCount reports what a session-start hook would announce", () => {
    const { spool } = makeSpool();
    enqueue(spool, "first durable capture line for the pending counter");
    enqueue(spool, "second durable capture line for the pending counter");
    expect(spool.pendingSpoolCount()).toBe(2);
  });

  test("too-short and duplicate captures are dropped at enqueue", () => {
    const { spool } = makeSpool();
    expect(enqueue(spool, "tiny")).toBeNull();
    const content = "identical capture content that is long enough to keep";
    expect(enqueue(spool, content)).not.toBeNull();
    expect(enqueue(spool, content)).toBeNull();
    expect(spool.pendingSpoolCount()).toBe(1);
  });
});
