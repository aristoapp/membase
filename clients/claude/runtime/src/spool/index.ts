import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type { MembaseClient } from "../api/client.js";
import { ensureDataDir } from "../config/index.js";
import type { CaptureRecord } from "../types.js";
import { sanitizeMembaseText, truncateText } from "../sanitize/index.js";

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 2_000;
const INFLIGHT_STALE_MS = 60_000;
const SLEEP_BUFFER = new SharedArrayBuffer(4);
const SLEEP_VIEW = new Int32Array(SLEEP_BUFFER);

function spoolDir(): string {
  const dir = join(ensureDataDir(), "spool");
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

function sleepSync(ms: number): void {
  Atomics.wait(SLEEP_VIEW, 0, 0, ms);
}

function acquireLock(timeoutMs = LOCK_WAIT_MS): () => void {
  const path = lockPath();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const fd = openSync(path, "wx", 0o600);
      writeFileSync(fd, `${process.pid}\n${Date.now()}\n`);
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

function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function captureId(args: {
  sessionId?: string;
  captureKind: string;
  content: string;
}): string {
  return hash(
    `${args.sessionId ?? "unknown"}:${args.captureKind}:${sanitizeMembaseText(
      args.content,
    )}`,
  );
}

function readRecordsFromPath(path: string): CaptureRecord[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line) as CaptureRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is CaptureRecord => Boolean(record));
}

function readRecords(): CaptureRecord[] {
  return readRecordsFromPath(spoolPath());
}

function writeRecordsToPath(path: string, records: CaptureRecord[]): void {
  const tmp = `${path}.tmp`;
  writeFileSync(
    tmp,
    records.map((record) => JSON.stringify(record)).join("\n") +
      (records.length ? "\n" : ""),
    { encoding: "utf-8", mode: 0o600 },
  );
  renameSync(tmp, path);
}

function writeRecords(records: CaptureRecord[]): void {
  writeRecordsToPath(spoolPath(), records);
}

function appendRecords(records: CaptureRecord[]): void {
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
  const path = sentPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(values, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  renameSync(tmp, path);
}

function inflightFiles(): string[] {
  return readdirSync(spoolDir())
    .filter((name) => name.startsWith("inflight-") && name.endsWith(".jsonl"))
    .map((name) => join(spoolDir(), name));
}

function readInflightRecords(): CaptureRecord[] {
  return inflightFiles().flatMap((path) => readRecordsFromPath(path));
}

function dedupeRecords(
  records: CaptureRecord[],
  sentIds = readSentIds(),
): CaptureRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (sentIds.has(record.capture_id) || seen.has(record.capture_id)) {
      return false;
    }
    seen.add(record.capture_id);
    return true;
  });
}

function appendPendingRecordsLocked(records: CaptureRecord[]): void {
  const sentIds = readSentIds();
  const existingIds = new Set(readRecords().map((record) => record.capture_id));
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

export function enqueueCapture(
  record: Omit<CaptureRecord, "created_at" | "capture_id"> & {
    sessionId?: string;
  },
): CaptureRecord | null {
  const content = sanitizeMembaseText(record.content);
  if (!content || content.length < 20) return null;
  const next: CaptureRecord = {
    capture_id: captureId({
      sessionId: record.sessionId,
      captureKind: record.capture_kind,
      content,
    }),
    capture_kind: record.capture_kind,
    content,
    display_summary: record.display_summary ?? truncateText(content, 180),
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

export async function flushSpool(
  client: MembaseClient,
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

  const failed: CaptureRecord[] = [];
  let flushed = 0;
  for (const record of drained.batch) {
    try {
      await client.ingestMemory({
        content: record.content,
        display_summary: record.display_summary,
        project: record.project,
        metadata: {
          ...record.metadata,
          capture_id: record.capture_id,
          capture_kind: record.capture_kind,
        },
      });
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
        last_error: error instanceof Error ? error.message : String(error),
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

export function pendingSpoolCount(): number {
  return withSpoolLock(() => {
    recoverStaleInflightLocked();
    return readRecords().length;
  });
}
