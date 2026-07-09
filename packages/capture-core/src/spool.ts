// Disk-persisted capture spool.
//
// Extracted from the Claude runtime. This design exists for hosts whose hook
// handlers are SHORT-LIVED SPAWNED PROCESSES (Claude Code today, Cursor's
// hooks.json processes): captures must survive across invocations, so
// the queue lives on disk with a lock file, crash-safe inflight handoff, and
// a sent-id ledger for dedupe. Long-lived hosts (OpenClaw gateway, Hermes)
// keep their in-process queues — this is deliberately NOT one abstraction
// over both models.
import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { truncateText } from "./index.js";
import { writeTextAtomic } from "./token-store.js";

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 2_000;
const INFLIGHT_STALE_MS = 60_000;
const SLEEP_BUFFER = new SharedArrayBuffer(4);
const SLEEP_VIEW = new Int32Array(SLEEP_BUFFER);

export interface SpoolRecord {
  capture_id: string;
  capture_kind: string;
  content: string;
  display_summary?: string;
  project?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  attempts?: number;
  last_error?: string;
}

export interface CaptureSpoolOptions {
  /** Parent state directory; a `spool/` subdir is created inside (0700). */
  stateDir: () => string;
  /** Host sanitizer applied to content before hashing/storing. */
  sanitize: (text: string) => string;
  /** Captures shorter than this (after sanitize) are dropped. */
  minContentLength?: number;
}

export interface CaptureSpool {
  captureId(args: {
    sessionId?: string;
    captureKind: string;
    content: string;
  }): string;
  enqueueCapture(
    record: Omit<SpoolRecord, "created_at" | "capture_id"> & {
      sessionId?: string;
    },
  ): SpoolRecord | null;
  flushSpool(
    // biome-ignore lint/suspicious/noConfusingVoidType: senders may legitimately return nothing; undefined would force every caller to return a value
    send: (record: SpoolRecord) => Promise<void | boolean>,
    limit?: number,
  ): Promise<{ flushed: number; remaining: number }>;
  pendingSpoolCount(): number;
}

function sleepSync(ms: number): void {
  Atomics.wait(SLEEP_VIEW, 0, 0, ms);
}

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function createCaptureSpool(
  options: CaptureSpoolOptions,
): CaptureSpool {
  const minContentLength = options.minContentLength ?? 20;

  function spoolDir(): string {
    const dir = join(options.stateDir(), "spool");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  function spoolPath(): string {
    return join(spoolDir(), "pending.jsonl");
  }

  function sentPath(): string {
    return join(spoolDir(), "sent.json");
  }

  function lockPath(): string {
    return join(spoolDir(), ".lock");
  }

  function inflightPath(): string {
    return join(spoolDir(), `inflight-${process.pid}-${Date.now()}.jsonl`);
  }

  function acquireLock(timeoutMs = LOCK_WAIT_MS): () => void {
    const path = lockPath();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const fd = openSync(path, "wx", 0o600);
        return () => {
          try {
            closeSync(fd);
          } catch {}
          try {
            rmSync(path, { force: true });
          } catch {}
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
            rmSync(path, { force: true });
            continue;
          }
        } catch {}
        sleepSync(25);
      }
    }
    throw new Error("Timed out waiting for Membase capture spool lock.");
  }

  function withSpoolLock<T>(callback: () => T, timeoutMs = LOCK_WAIT_MS): T {
    const release = acquireLock(timeoutMs);
    try {
      return callback();
    } finally {
      release();
    }
  }

  function captureId(args: {
    sessionId?: string;
    captureKind: string;
    content: string;
  }): string {
    return hash(
      `${args.sessionId ?? "unknown"}:${args.captureKind}:${options.sanitize(
        args.content,
      )}`,
    );
  }

  function readRecordsFromPath(path: string): SpoolRecord[] {
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map((line) => {
        try {
          return JSON.parse(line) as SpoolRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is SpoolRecord => Boolean(record));
  }

  function readRecords(): SpoolRecord[] {
    return readRecordsFromPath(spoolPath());
  }

  function writeRecordsToPath(path: string, records: SpoolRecord[]): void {
    writeTextAtomic(
      path,
      records.map((record) => JSON.stringify(record)).join("\n") +
        (records.length ? "\n" : ""),
    );
  }

  function writeRecords(records: SpoolRecord[]): void {
    writeRecordsToPath(spoolPath(), records);
  }

  function appendRecords(records: SpoolRecord[]): void {
    if (records.length === 0) return;
    appendFileSync(
      spoolPath(),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      {
        encoding: "utf-8",
        mode: 0o600,
      },
    );
  }

  function readSentIds(): Set<string> {
    const path = sentPath();
    if (!existsSync(path)) return new Set();
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(
        parsed.filter((value): value is string => typeof value === "string"),
      );
    } catch {
      return new Set();
    }
  }

  function writeSentIds(ids: Set<string>): void {
    const values = Array.from(ids).slice(-2000);
    writeTextAtomic(sentPath(), `${JSON.stringify(values, null, 2)}\n`);
  }

  function inflightFiles(): string[] {
    return readdirSync(spoolDir())
      .filter((name) => name.startsWith("inflight-") && name.endsWith(".jsonl"))
      .map((name) => join(spoolDir(), name));
  }

  function readInflightRecords(): SpoolRecord[] {
    return inflightFiles().flatMap((path) => readRecordsFromPath(path));
  }

  function dedupeRecords(
    records: SpoolRecord[],
    sentIds = readSentIds(),
  ): SpoolRecord[] {
    const seen = new Set<string>();
    return records.filter((record) => {
      if (sentIds.has(record.capture_id) || seen.has(record.capture_id)) {
        return false;
      }
      seen.add(record.capture_id);
      return true;
    });
  }

  function appendPendingRecordsLocked(records: SpoolRecord[]): void {
    const sentIds = readSentIds();
    const existingIds = new Set(
      readRecords().map((record) => record.capture_id),
    );
    const next = records.filter((record) => {
      if (sentIds.has(record.capture_id) || existingIds.has(record.capture_id)) {
        return false;
      }
      existingIds.add(record.capture_id);
      return true;
    });
    appendRecords(next);
  }

  function recoverStaleInflightLocked(): void {
    const now = Date.now();
    for (const path of inflightFiles()) {
      try {
        if (now - statSync(path).mtimeMs < INFLIGHT_STALE_MS) continue;
        appendPendingRecordsLocked(readRecordsFromPath(path));
        rmSync(path, { force: true });
      } catch {}
    }
  }

  function enqueueCapture(
    record: Omit<SpoolRecord, "created_at" | "capture_id"> & {
      sessionId?: string;
    },
  ): SpoolRecord | null {
    const content = options.sanitize(record.content);
    if (!content || content.length < minContentLength) return null;
    const next: SpoolRecord = {
      capture_id: captureId({
        sessionId: record.sessionId,
        captureKind: record.capture_kind,
        content,
      }),
      capture_kind: record.capture_kind,
      content,
      // Caller-supplied display_summary is raw hook/tool text — sanitize it
      // like content so secrets can't reach disk via the summary field.
      display_summary: record.display_summary
        ? options.sanitize(record.display_summary)
        : truncateText(content, 180),
      project: record.project,
      metadata: record.metadata,
      created_at: new Date().toISOString(),
      attempts: 0,
    };
    try {
      return withSpoolLock(() => {
        recoverStaleInflightLocked();
        const existing = [...readRecords(), ...readInflightRecords()];
        if (existing.some((item) => item.capture_id === next.capture_id)) {
          return null;
        }
        if (readSentIds().has(next.capture_id)) return null;
        appendRecords([next]);
        return next;
      });
    } catch {
      return null;
    }
  }

  function pendingSpoolCount(): number {
    return withSpoolLock(() => {
      recoverStaleInflightLocked();
      return readRecords().length;
    });
  }

  async function flushSpool(
    // biome-ignore lint/suspicious/noConfusingVoidType: senders may legitimately return nothing; undefined would force every caller to return a value
    send: (record: SpoolRecord) => Promise<void | boolean>,
    limit = 10,
  ): Promise<{ flushed: number; remaining: number }> {
    const drained = withSpoolLock(() => {
      recoverStaleInflightLocked();
      const sentIds = readSentIds();
      const records = dedupeRecords(readRecords(), sentIds);
      const batch = records.slice(0, limit);
      const pending = records.slice(limit);
      writeRecords(pending);
      const path = batch.length > 0 ? inflightPath() : undefined;
      if (path) writeRecordsToPath(path, batch);
      return { batch, path };
    });
    if (drained.batch.length === 0) {
      return { flushed: 0, remaining: pendingSpoolCount() };
    }

    const failed: SpoolRecord[] = [];
    let flushed = 0;
    for (const record of drained.batch) {
      try {
        // A resolved `false` counts as failure too — JS callers signalling
        // by return value must not silently drop the record.
        if ((await send(record)) === false) {
          throw new Error("uploader returned false");
        }
        withSpoolLock(() => {
          const sentIds = readSentIds();
          sentIds.add(record.capture_id);
          writeSentIds(sentIds);
        });
        flushed += 1;
      } catch (error) {
        failed.push({
          ...record,
          attempts: (record.attempts ?? 0) + 1,
          // Uploader errors can echo response bodies; sanitize and clamp
          // before persisting to disk.
          last_error: truncateText(
            options.sanitize(
              error instanceof Error ? error.message : String(error),
            ),
            300,
          ),
        });
      }
    }

    const remaining = withSpoolLock(() => {
      appendPendingRecordsLocked(failed);
      if (drained.path) rmSync(drained.path, { force: true });
      return readRecords().length;
    });
    return { flushed, remaining };
  }

  return { captureId, enqueueCapture, flushSpool, pendingSpoolCount };
}
