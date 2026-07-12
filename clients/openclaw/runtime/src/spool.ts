// Failure-path capture spool for OpenClaw.
//
// The normal capture path stays in-memory (hooks/capture.ts) — the shared
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
 * One wiki capture document (a single part of a possibly multi-part
 * transcript). Capture builds these; a failed upload spools each unuploaded
 * part as its own record, so "which parts already succeeded" is simply
 * "which parts were never enqueued" — the drain resumes from the first
 * unuploaded part by re-creating exactly the spooled ones.
 */
export interface CaptureDocumentPayload {
  title: string;
  content: string;
  project?: string;
  sourceMetadata?: Record<string, unknown>;
}

const WIKI_DOCUMENT_KIND = "wiki_document";

/**
 * Persist one failed capture document to disk so a restart can't lose it.
 * Returns true only if the record actually reached disk — enqueueCapture
 * returns null on a dedup hit or a lock timeout, and the caller must NOT drop
 * its RAM copy in that case (else the part is lost from both places).
 * `channelKey` is threaded as the sessionId so identical text from two
 * channels doesn't collide on the capture_id hash.
 */
export function spoolFailedDocument(
  doc: CaptureDocumentPayload,
  channelKey?: string,
): boolean {
  return (
    getCaptureSpool().enqueueCapture({
      sessionId: channelKey,
      capture_kind: WIKI_DOCUMENT_KIND,
      content: doc.content,
      display_summary: doc.title,
      project: doc.project,
      metadata: {
        source: "openclaw",
        capture_kind: WIKI_DOCUMENT_KIND,
        title: doc.title,
        source_metadata: doc.sourceMetadata ?? {},
      },
    }) !== null
  );
}

/**
 * Upload everything the spool is holding, via the authenticated client. Safe to
 * call repeatedly and concurrently — the spool claims each batch (inflight
 * rename) and tracks sent ids, so a record is never uploaded twice.
 * Returns counts for the caller to report.
 */
const FLUSH_BATCH_LIMIT = 50;

export async function flushCaptureSpool(
  client: MembaseClient,
): Promise<{ flushed: number; remaining: number }> {
  return getCaptureSpool().flushSpool(async (record) => {
    if (record.capture_kind === WIKI_DOCUMENT_KIND) {
      // Wiki-transcript capture record: resume document creation for this
      // part. createWikiDocument throws on non-ok HTTP, so a failure keeps
      // the record spooled.
      const meta = record.metadata as
        | { title?: unknown; source_metadata?: unknown }
        | undefined;
      const title =
        typeof meta?.title === "string" && meta.title
          ? meta.title
          : `OpenClaw conversation capture - ${record.created_at}`;
      const sourceMetadata =
        meta?.source_metadata && typeof meta.source_metadata === "object"
          ? (meta.source_metadata as Record<string, unknown>)
          : undefined;
      await client.createWikiDocument(title, record.content, {
        project: record.project,
        sourceMetadata,
      });
      return;
    }
    // Legacy record spooled before the wiki-transcript capture path shipped:
    // keep it readable and drain it through /memory/ingest as before. ingest
    // throws on non-ok HTTP, and an explicit `{status:"error"}` body is also a
    // failure — either way the record must stay spooled, not be marked sent.
    const result = await client.ingest(record.content, {
      project: record.project,
    });
    if (result?.status === "error") return false;
  }, FLUSH_BATCH_LIMIT);
}

/** For tests: drop the memoized instance so a new stateDir takes effect. */
export function resetCaptureSpoolForTest(): void {
  cached = null;
}
