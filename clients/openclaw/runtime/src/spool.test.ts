import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MembaseClient } from "./client";
import {
  flushCaptureSpool,
  getCaptureSpool,
  resetCaptureSpoolForTest,
  spoolFailedDocument,
} from "./spool";

// Failed capture documents persist to a disk spool; `dream`
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

function doc(content: string, extra?: { title?: string; project?: string }) {
  return {
    title: extra?.title ?? "OpenClaw conversation capture - 2026-07-12",
    content,
    project: extra?.project,
    sourceMetadata: {
      capture_kind: "conversation_transcript",
      part_index: 1,
      part_total: 1,
    },
  };
}

/** Minimal client stub for the drain paths. */
function stubClient(behavior: {
  onCreateWiki?: (
    title: string,
    content: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  onIngest?: (content: string) => Promise<{ status: string }>;
}): MembaseClient {
  return {
    createWikiDocument: (
      title: string,
      content: string,
      options?: Record<string, unknown>,
    ) =>
      behavior.onCreateWiki
        ? behavior.onCreateWiki(title, content, options)
        : Promise.reject(new Error("unexpected createWikiDocument")),
    ingest: (content: string) =>
      behavior.onIngest
        ? behavior.onIngest(content)
        : Promise.reject(new Error("unexpected ingest")),
  } as unknown as MembaseClient;
}

describe("failure-path spool", () => {
  test("spoolFailedDocument writes a durable document record to pending.jsonl", () => {
    spoolFailedDocument(
      doc("a real captured conversation worth keeping", { project: "Docs" }),
    );
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);
    const raw = readFileSync(spoolFile(), "utf-8").trim();
    const record = JSON.parse(raw);
    expect(record.capture_kind).toBe("wiki_document");
    expect(record.content).toContain("real captured conversation");
    expect(record.project).toBe("Docs");
    expect(record.metadata.title).toContain("OpenClaw conversation capture");
    expect(record.metadata.source_metadata.capture_kind).toBe(
      "conversation_transcript",
    );
    expect(record.capture_id).toBeTruthy();
  });

  test("secrets are redacted before the line hits disk", () => {
    // The assignment shape triggers capture-core's redaction; the value uses a
    // hygiene-safe "dummy-" prefix so this fixture isn't flagged as a real leak.
    const secretValue = "dummy-abcdefghijklmno";
    spoolFailedDocument(doc(`here is my OPENAI_API_KEY=${secretValue} ok`));
    const raw = readFileSync(spoolFile(), "utf-8");
    expect(raw).not.toContain(secretValue);
  });

  test("returns true when persisted, false when the spool declines a dup", () => {
    const d = doc("a captured turn that the spool will accept first time");
    expect(spoolFailedDocument(d)).toBe(true);
    // Same content + same (missing) sessionId → capture_id dedup → declined.
    // The caller relies on this false to keep the RAM copy instead of
    // dropping it.
    expect(spoolFailedDocument(d)).toBe(false);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);
  });

  test("identical content on different channels does not collide", () => {
    const content =
      "the same reminder text sent in two different channels here";
    expect(spoolFailedDocument(doc(content), "channel-a")).toBe(true);
    expect(spoolFailedDocument(doc(content), "channel-b")).toBe(true);
    // Without the channelKey→sessionId threading both would hash to
    // "unknown:..." and the second would be dropped.
    expect(getCaptureSpool().pendingSpoolCount()).toBe(2);
  });
});

describe("dream flush", () => {
  test("recreates every spooled wiki document and empties the spool", async () => {
    spoolFailedDocument(
      doc("first captured transcript part about the project plan", {
        title: "capture part 1",
      }),
    );
    spoolFailedDocument(
      doc("second captured transcript part about a decision made", {
        title: "capture part 2",
        project: "Ops",
      }),
    );
    expect(getCaptureSpool().pendingSpoolCount()).toBe(2);

    const uploaded: Array<{
      title: string;
      content: string;
      options?: Record<string, unknown>;
    }> = [];
    const client = stubClient({
      onCreateWiki: async (title, content, options) => {
        uploaded.push({ title, content, options });
        return { id: `doc-${uploaded.length}` };
      },
    });

    const result = await flushCaptureSpool(client);
    expect(result.flushed).toBe(2);
    expect(result.remaining).toBe(0);
    expect(uploaded.length).toBe(2);
    expect(uploaded.map((u) => u.title).sort()).toEqual([
      "capture part 1",
      "capture part 2",
    ]);
    const withProject = uploaded.find((u) => u.options?.project === "Ops");
    expect(withProject).toBeTruthy();
    expect(
      (withProject?.options?.sourceMetadata as Record<string, unknown>)
        ?.capture_kind,
    ).toBe("conversation_transcript");
    expect(getCaptureSpool().pendingSpoolCount()).toBe(0);
  });

  test("a failed upload leaves the record in the spool for a later dream", async () => {
    spoolFailedDocument(doc("a document the server will reject this time"));
    const client = stubClient({
      onCreateWiki: async () => {
        throw new Error("500 from server");
      },
    });

    const result = await flushCaptureSpool(client);
    expect(result.flushed).toBe(0);
    expect(result.remaining).toBe(1);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);
  });

  test("legacy ingest-string records stay drainable via /memory/ingest", async () => {
    // Records spooled before the wiki-transcript capture path shipped have
    // capture_kind "conversation" and no document metadata — the drain must
    // still upload them through ingest.
    getCaptureSpool().enqueueCapture({
      capture_kind: "conversation",
      content: "an old spooled capture from before the wiki upload path",
      metadata: { source: "openclaw", capture_kind: "conversation" },
    });
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);

    const ingested: string[] = [];
    const client = stubClient({
      onIngest: async (content) => {
        ingested.push(content);
        return { status: "ok" };
      },
    });

    const result = await flushCaptureSpool(client);
    expect(result.flushed).toBe(1);
    expect(ingested[0]).toContain("old spooled capture");
    expect(getCaptureSpool().pendingSpoolCount()).toBe(0);
  });

  test("a 200 with {status:'error'} body is NOT marked sent for legacy records", async () => {
    getCaptureSpool().enqueueCapture({
      capture_kind: "conversation",
      content: "a message the server 200s but reports an error for",
      metadata: { source: "openclaw", capture_kind: "conversation" },
    });
    const client = stubClient({
      onIngest: async () => ({ status: "error" }),
    });

    const result = await flushCaptureSpool(client);
    expect(result.flushed).toBe(0);
    expect(result.remaining).toBe(1);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);
  });
});
