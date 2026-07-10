// Claude-runtime spool surface, now backed by the disk spool in
// @membase/capture-core. Public API and on-disk
// layout are unchanged (same spool/ dir, pending.jsonl, sent.json, .lock,
// inflight files). Claude-specific pieces stay here: the state dir, the
// sanitize function, the CaptureRecord kind union, and the ingest mapping.
import { join } from "node:path";
import { createCaptureSpool, type SpoolRecord } from "@membase/capture-core";
import type { MembaseClient } from "../api/client.js";
import { ensureDataDir } from "../config/index.js";
import type { CaptureRecord } from "../types.js";
import { sanitizeMembaseText } from "../sanitize/index.js";

const spool = createCaptureSpool({
  stateDir: ensureDataDir,
  sanitize: sanitizeMembaseText,
});

export function captureId(args: {
  sessionId?: string;
  captureKind: string;
  content: string;
}): string {
  return spool.captureId(args);
}

export function enqueueCapture(
  record: Omit<CaptureRecord, "created_at" | "capture_id"> & {
    sessionId?: string;
  },
): CaptureRecord | null {
  return spool.enqueueCapture(record) as CaptureRecord | null;
}

export async function flushSpool(
  client: MembaseClient,
  limit = 10,
): Promise<{ flushed: number; remaining: number }> {
  return spool.flushSpool(
    (record: SpoolRecord) =>
      client
        .ingestMemory({
          content: record.content,
          display_summary: record.display_summary,
          project: record.project,
          metadata: {
            ...record.metadata,
            capture_id: record.capture_id,
            capture_kind: record.capture_kind,
          },
        })
        .then(() => {}),
    limit,
  );
}

export function pendingSpoolCount(): number {
  return spool.pendingSpoolCount();
}

// Mirrors the capture-core spool layout for the same stateDir; keeps callers
// from re-encoding the spool path themselves.
export function pendingSpoolPath(): string {
  return join(ensureDataDir(), "spool", "pending.jsonl");
}
