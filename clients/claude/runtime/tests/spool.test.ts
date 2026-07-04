import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import {
  enqueueCapture,
  flushSpool,
  pendingSpoolCount,
} from "../src/spool/index.js";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
  delete process.env.CLAUDE_PLUGIN_DATA;
});

describe("spool", () => {
  it("deduplicates capture ids", () => {
    tempDir = mkdtempSync(join(tmpdir(), "claude-membase-test-"));
    process.env.CLAUDE_PLUGIN_DATA = tempDir;
    const record = {
      capture_kind: "compact_summary" as const,
      content: "The user prefers TypeScript for frontend work.",
      sessionId: "s1",
      metadata: { plugin: "claude-membase" },
    };
    expect(enqueueCapture(record)).not.toBeNull();
    expect(enqueueCapture(record)).toBeNull();
    expect(pendingSpoolCount()).toBe(1);
  });

  it("does not re-enqueue captures after a successful flush", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "claude-membase-test-"));
    process.env.CLAUDE_PLUGIN_DATA = tempDir;
    const record = {
      capture_kind: "compact_summary" as const,
      content: "The user decided to keep the plugin-local bridge architecture.",
      sessionId: "s1",
      metadata: { plugin: "claude-membase" },
    };
    const client = {
      ingestMemory: async () => ({
        memory_id: "m1",
        revision_id: "r1",
        status: "created",
      }),
    };

    expect(enqueueCapture(record)).not.toBeNull();
    await expect(flushSpool(client as never)).resolves.toEqual({
      flushed: 1,
      remaining: 0,
    });
    expect(enqueueCapture(record)).toBeNull();
    expect(pendingSpoolCount()).toBe(0);
  });

  it("preserves captures enqueued while a flush is in flight", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "claude-membase-test-"));
    process.env.CLAUDE_PLUGIN_DATA = tempDir;
    const first = {
      capture_kind: "compact_summary" as const,
      content: "The team chose local bridge hooks for Claude Code memory.",
      sessionId: "s1",
      metadata: { plugin: "claude-membase" },
    };
    const second = {
      capture_kind: "tool_summary" as const,
      content: "Claude Code ran the release verification command successfully.",
      sessionId: "s1",
      metadata: { plugin: "claude-membase" },
    };
    let enqueuedDuringFlush = false;
    const client = {
      ingestMemory: async () => {
        if (!enqueuedDuringFlush) {
          enqueuedDuringFlush = true;
          expect(enqueueCapture(second)).not.toBeNull();
        }
        return {
          memory_id: "m1",
          revision_id: "r1",
          status: "created",
        };
      },
    };

    expect(enqueueCapture(first)).not.toBeNull();
    await expect(flushSpool(client as never, 1)).resolves.toEqual({
      flushed: 1,
      remaining: 1,
    });
    expect(pendingSpoolCount()).toBe(1);
    await expect(flushSpool(client as never, 10)).resolves.toEqual({
      flushed: 1,
      remaining: 0,
    });
  });
});
