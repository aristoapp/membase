import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MembaseClient } from "./client";
import {
  flushCaptureSpool,
  getCaptureSpool,
  resetCaptureSpoolForTest,
  spoolFailedCapture,
} from "./spool";

// ADR 0005 / DR-1: failed captures persist to a disk spool; `dream`
// (flushCaptureSpool) uploads them. These exercise the real capture-core spool
// via an isolated MEMBASE_DATA_DIR.

let dataDir: string;
let prevEnv: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "oc-spool-"));
  prevEnv = process.env.MEMBASE_DATA_DIR;
  process.env.MEMBASE_DATA_DIR = dataDir;
  resetCaptureSpoolForTest();
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.MEMBASE_DATA_DIR;
  else process.env.MEMBASE_DATA_DIR = prevEnv;
  resetCaptureSpoolForTest();
  rmSync(dataDir, { recursive: true, force: true });
});

const spoolFile = () => join(dataDir, "spool", "pending.jsonl");

/** Minimal client stub: ingest either records the call or throws. */
function stubClient(behavior: {
  onIngest: (content: string) => Promise<{ status: string }>;
}): MembaseClient {
  return {
    ingest: (content: string) => behavior.onIngest(content),
  } as unknown as MembaseClient;
}

describe("failure-path spool", () => {
  test("spoolFailedCapture writes a durable record to pending.jsonl", () => {
    spoolFailedCapture("a real captured conversation worth keeping");
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);
    const raw = readFileSync(spoolFile(), "utf-8").trim();
    const record = JSON.parse(raw);
    expect(record.content).toContain("real captured conversation");
    expect(record.capture_id).toBeTruthy();
  });

  test("secrets are redacted before the line hits disk", () => {
    // The assignment shape triggers capture-core's redaction; the value uses a
    // hygiene-safe "dummy-" prefix so this fixture isn't flagged as a real leak.
    const secretValue = "dummy-abcdefghijklmno";
    spoolFailedCapture(`here is my OPENAI_API_KEY=${secretValue} ok`);
    const raw = readFileSync(spoolFile(), "utf-8");
    expect(raw).not.toContain(secretValue);
  });

  test("returns true when persisted, false when the spool declines a dup", () => {
    const content = "a captured turn that the spool will accept first time";
    expect(spoolFailedCapture(content)).toBe(true);
    // Same content + same (missing) sessionId → capture_id dedup → declined. The
    // caller relies on this false to keep the RAM copy instead of dropping it.
    expect(spoolFailedCapture(content)).toBe(false);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);
  });

  test("identical content on different channels does not collide", () => {
    const content = "the same reminder text sent in two different channels here";
    expect(spoolFailedCapture(content, "channel-a")).toBe(true);
    expect(spoolFailedCapture(content, "channel-b")).toBe(true);
    // Without the channelKey→sessionId threading both would hash to
    // "unknown:..." and the second would be dropped.
    expect(getCaptureSpool().pendingSpoolCount()).toBe(2);
  });
});

describe("dream flush", () => {
  test("uploads every spooled record and empties the spool", async () => {
    spoolFailedCapture("first captured message about the project plan");
    spoolFailedCapture("second captured message about a decision made");
    expect(getCaptureSpool().pendingSpoolCount()).toBe(2);

    const uploaded: string[] = [];
    const client = stubClient({
      onIngest: async (content) => {
        uploaded.push(content);
        return { status: "ok" };
      },
    });

    const result = await flushCaptureSpool(client);
    expect(result.flushed).toBe(2);
    expect(result.remaining).toBe(0);
    expect(uploaded.length).toBe(2);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(0);
  });

  test("a failed upload leaves the record in the spool for a later dream", async () => {
    spoolFailedCapture("a message the server will reject this time");
    const client = stubClient({
      onIngest: async () => {
        throw new Error("500 from server");
      },
    });

    const result = await flushCaptureSpool(client);
    expect(result.flushed).toBe(0);
    expect(result.remaining).toBe(1);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);
  });
});
