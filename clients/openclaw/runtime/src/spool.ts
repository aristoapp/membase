// Failure-path capture spool for OpenClaw (ADR 0005 / DR-1).
//
// The normal capture path stays in-memory (hooks/capture.ts) — ADR 0002's
// "don't force the disk abstraction on the long-lived gateway". This spool is
// used ONLY when a live upload fails: instead of retaining the batch in RAM
// (lost on gateway restart), enqueue it here so a later `membase dream` (or the
// startup drain) can upload it. The disk-spool logic itself is reused verbatim
// from capture-core — the same one Claude/Cursor/Codex use.
import { type CaptureSpool, createCaptureSpool } from "@membase/capture-core";
import type { MembaseClient } from "./client";
import { membaseStateDir } from "./config";
import { sanitizeCaptureText } from "./utils";

let cached: CaptureSpool | null = null;

/** One process-wide spool instance rooted at the OpenClaw state dir. */
export function getCaptureSpool(): CaptureSpool {
  if (!cached) {
    cached = createCaptureSpool({
      stateDir: membaseStateDir,
      sanitize: sanitizeCaptureText,
    });
  }
  return cached;
}

/**
 * Persist a failed capture batch to disk so a restart can't lose it. Returns
 * true only if the record actually reached disk — enqueueCapture returns null
 * on a dedup hit or a lock timeout, and the caller must NOT drop its RAM copy
 * in that case (else the batch is lost from both places). `channelKey` is
 * threaded as the sessionId so identical text from two channels doesn't collide
 * on the capture_id hash (which falls back to "unknown" without it).
 */
export function spoolFailedCapture(content: string, channelKey?: string): boolean {
  return (
    getCaptureSpool().enqueueCapture({
      sessionId: channelKey,
      capture_kind: "conversation",
      content,
      metadata: { source: "openclaw", capture_kind: "conversation" },
    }) !== null
  );
}

/**
 * Upload everything the spool is holding, via the authenticated client. Safe to
 * call repeatedly and concurrently — the spool claims each batch (inflight
 * rename) and tracks sent ids, so a record is never uploaded twice.
 * Returns counts for the caller to report.
 */
export async function flushCaptureSpool(
  client: MembaseClient,
  limit = 50,
): Promise<{ flushed: number; remaining: number }> {
  return getCaptureSpool().flushSpool(async (record) => {
    // ingest throws on failure; a normal return counts as success. Return void
    // (not the {status} object) to match flushSpool's void|boolean contract.
    await client.ingest(record.content, { project: record.project });
  }, limit);
}

/** For tests: drop the memoized instance so a new stateDir takes effect. */
export function resetCaptureSpoolForTest(): void {
  cached = null;
}
