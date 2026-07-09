// Per-session tool-observation scratch. This is NOT the upload
// spool: nothing here is ever a memory on its own. Each session appends its
// meaningful tool observations to `scratch/<session_id>.jsonl` during the
// session; at session end (or, for a session with no end event, the next
// SessionStart sweep) the observations are folded into ONE digest and enqueued
// to the real spool, then the scratch file is deleted. Lives under the same
// data dir as the spool but in a separate `scratch/` subdir so it never
// pollutes pending.jsonl.
//
// Consume is a two-step handshake: readSession/sweepIdleSessions return a
// session WITHOUT deleting its file; the caller deletes it via discardScratch
// only AFTER the digest is durably in the spool. A failed enqueue therefore
// leaves the scratch on disk for the next sweep instead of losing the session.
//
// No lock file: entries are appended (append is atomic for small writes) and a
// session only ever writes its own file. Cross-process contention is only
// possible during a sweep, guarded by the idle threshold below.
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { ensureDataDir } from "../config/index.js";
import { sanitizeMembaseText } from "../sanitize/index.js";
import type { ToolObservation } from "../hooks/summary.js";

// A scratch file untouched for this long belongs to a session that ended
// without firing its end event (Codex, or a crash). The next SessionStart
// sweeps it. Well above any inter-tool gap so a live session is never swept
// out from under itself.
export const SCRATCH_IDLE_MS = 30 * 60 * 1000; // 30 minutes

// A scratch file older than this is deleted on sweep even if it can't be
// digested (corrupt/empty), so crash-orphans can't accumulate without bound.
// Bounds the common crash-orphan case; a machine that turns capture
// off forever keeps at most its final summary-mode session's files (sweep runs
// only in summary mode) — acceptable, not worth an unconditional prune pass.
export const SCRATCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// A single session's scratch never grows past this many observation lines. A
// pathological 10k-tool run would otherwise accumulate megabytes that every
// takeSession/sweep must read whole; the digest only ever shows the first
// MAX_FILES/MAX_COMMANDS anyway, so older lines past the cap add nothing.
// Fixed ceiling; a windowed ring buffer is overkill for a digest.
export const SCRATCH_MAX_OBSERVATIONS = 2000;

interface ScratchMeta {
  meta: true;
  session_id?: string;
  project?: string;
  client_source?: string;
  cwd?: string;
  started_at: string;
}

// mkdir+chmod is idempotent but a syscall pair; memoize per process so the hot
// path (appendObservation per tool call, touchSession per Stop) ensures the dir
// once instead of on every path computation. Keyed on the resolved dir so a
// change to MEMBASE_DATA_DIR (tests, or a re-pointed process) re-ensures rather
// than returning a stale path.
let ensuredScratchDir: string | undefined;
function scratchDir(): string {
  const dir = join(ensureDataDir(), "scratch");
  if (ensuredScratchDir === dir) return dir;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // mkdirSync's mode only applies on creation; a dir made earlier (looser
  // umask, older version) keeps its perms. chmod so the 0o700 intent holds.
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best-effort: a chmod failure (e.g. non-owner) must not break capture.
  }
  ensuredScratchDir = dir;
  return dir;
}

// Filename portion for a session id — no dir ensure, so callers that only need
// the path (touchSession, sweep's current-session exclusion) don't mkdir.
function scratchFileName(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
  return `${safe || "unknown"}.jsonl`;
}

// session_id comes from the host; keep the filename to a safe charset so a
// hostile/odd id can't escape the scratch dir.
function scratchPath(sessionId: string): string {
  return join(scratchDir(), scratchFileName(sessionId));
}

/**
 * Append one tool observation for a session. Writes a meta header line the
 * first time it sees a session file so a later sweep knows the project/client
 * without re-deriving them. If a later call resolves a DIFFERENT project/cwd
 * (the session cd'd or changed config), a fresh meta line is appended and the
 * newest project/cwd wins at read time — so mid-session moves aren't frozen to
 * the first observation's project. Observations carry only tool metadata
 * (paths, commands) — already secret-filtered by extractToolObservation and
 * re-sanitized here as defense in depth.
 */
export function appendObservation(args: {
  sessionId?: string;
  observation: ToolObservation;
  project?: string;
  clientSource?: string;
  cwd?: string;
}): void {
  const sessionId = args.sessionId ?? "unknown";
  const path = scratchPath(sessionId);
  try {
    const lines: string[] = [];
    const fresh = !existsSync(path);
    // A moved session (different project/cwd than last recorded) appends a
    // refreshed header so the digest reflects where the work ended up.
    const moved = !fresh && metaChanged(path, args.project, args.cwd);
    // Bound a pathological session's file: once past the observation cap, stop
    // appending — the digest only shows MAX_FILES/MAX_COMMANDS, so later lines
    // add nothing but disk every read must load. A `moved` refresh is let
    // through (rare, tiny, and losing a project change is worse than one line).
    if (!fresh && !moved && overCap(path)) return;
    if (fresh || moved) {
      const meta: ScratchMeta = {
        meta: true,
        session_id: sessionId,
        project: args.project,
        client_source: args.clientSource,
        cwd: args.cwd,
        started_at: new Date().toISOString(),
      };
      lines.push(JSON.stringify(meta));
    }
    // Sanitize command strings once more before they touch disk, and strip
    // interior newlines so a path/command can't inject extra digest lines.
    const safe: ToolObservation = {
      files: args.observation.files.map((f) => flatten(sanitizeMembaseText(f))),
      commands: args.observation.commands.map((c) =>
        flatten(sanitizeMembaseText(c)),
      ),
      tasks: args.observation.tasks,
    };
    lines.push(JSON.stringify(safe));
    appendFileSync(path, `${lines.join("\n")}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    // appendFileSync's mode only applies when it CREATES the file; a file made
    // earlier under a looser umask keeps its perms. chmod every append so the
    // 0o600 intent holds regardless (idempotent, best-effort).
    try {
      chmodSync(path, 0o600);
    } catch {
      // never block the host on a perms failure.
    }
  } catch {
    // Scratch is best-effort: a failed append just loses one observation from
    // this session's digest, never blocks the host.
  }
}

// A generous byte ceiling standing in for SCRATCH_MAX_OBSERVATIONS: each
// observation line is small (a path or a truncated command), so this many bytes
// is well past the cap while staying a single cheap stat instead of a line
// count on every append.
const SCRATCH_MAX_BYTES = SCRATCH_MAX_OBSERVATIONS * 512;
function overCap(path: string): boolean {
  try {
    return statSync(path).size >= SCRATCH_MAX_BYTES;
  } catch {
    return false;
  }
}

// Collapse any interior newline/CR to a space: a file_path is host-supplied and
// unix permits newlines in paths, which would otherwise survive sanitize's
// line-preserving normalize and inject fabricated lines into the digest.
function flatten(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

// True when the session's latest meta records a project/cwd different from the
// one this call resolved — so a moved session appends a refreshed header rather
// than staying pinned to its first project. Best-effort: any read error means
// "assume unchanged" (don't spam headers on a transient failure).
// Reads the scratch once per append to find the latest project/cwd.
// One read per hook process (PostToolUse is its own process; a PostToolBatch
// reads once per call) — same order as the digest read, and the file is capped
// by overCap. A tail-only read is the upgrade if a huge-session profile flags it.
function metaChanged(
  path: string,
  project?: string,
  cwd?: string,
): boolean {
  try {
    const { meta } = parseScratchFile(path);
    if (!meta) return false;
    return meta.project !== project || meta.cwd !== cwd;
  } catch {
    return false;
  }
}

export interface ScratchSession {
  sessionId: string;
  /** On-disk file backing this session — pass to discardScratch after enqueue. */
  path: string;
  project?: string;
  /** Client that DID the work — so a cross-client sweep attributes correctly. */
  clientSource?: string;
  /** Working dir the session ran in — so a swept digest isn't mis-attributed. */
  cwd?: string;
  /** ISO time the session first wrote scratch — dates the digest correctly. */
  startedAt?: string;
  observations: ToolObservation[];
}

// Keep only string elements: a corrupt/tampered line could carry non-strings
// in files/commands, which would otherwise flow into the digest's join(...) as
// "[object Object]" or numbers.
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

// A meta line is only usable if its started_at is actually a string — a corrupt
// or foreign-writer line with a numeric started_at would otherwise throw at
// dateLabel time. Drop the bad meta (treat as no header) rather than crash.
function validMeta(parsed: Record<string, unknown>): ScratchMeta | null {
  if (typeof parsed.started_at !== "string") return null;
  return parsed as unknown as ScratchMeta;
}

function parseScratchFile(path: string): {
  meta: ScratchMeta | null;
  observations: ToolObservation[];
} {
  const raw = readFileSync(path, "utf-8").trim();
  let firstMeta: ScratchMeta | null = null;
  let latestMeta: ScratchMeta | null = null;
  const observations: ToolObservation[] = [];
  if (!raw) return { meta: null, observations };
  for (const line of raw.split(/\r?\n/)) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.meta === true) {
        const m = validMeta(parsed);
        if (!m) continue;
        // Keep the FIRST valid meta for started_at (the true session start,
        // never a later racer's clock), but let a LATER meta override
        // project/cwd — a session that cd'd appends a refreshed header and the
        // digest should reflect where the work actually ended up.
        if (!firstMeta) firstMeta = m;
        latestMeta = m;
        continue;
      }
      observations.push({
        files: stringArray(parsed.files),
        commands: stringArray(parsed.commands),
        tasks: typeof parsed.tasks === "number" ? parsed.tasks : 0,
      });
    } catch {
      // skip an unparseable line rather than dropping the whole session
    }
  }
  const meta =
    firstMeta && latestMeta
      ? {
          ...latestMeta,
          started_at: firstMeta.started_at,
          session_id: firstMeta.session_id,
          client_source: firstMeta.client_source,
        }
      : firstMeta;
  return { meta, observations };
}

function toSession(
  path: string,
  fallbackId: string,
  parsed: { meta: ScratchMeta | null; observations: ToolObservation[] },
): ScratchSession {
  return {
    sessionId: parsed.meta?.session_id ?? fallbackId,
    path,
    project: parsed.meta?.project,
    clientSource: parsed.meta?.client_source,
    cwd: parsed.meta?.cwd,
    startedAt: parsed.meta?.started_at,
    observations: parsed.observations,
  };
}

/**
 * Mark a session as alive by bumping its scratch mtime — the sweep's idle test
 * is mtime-based, so a live session that is merely quiet (a >30min human pause,
 * no tool calls) is not mistaken for a crashed one and swept out from under
 * itself. Called on every Stop AND UserPromptSubmit so a pause between turns
 * still refreshes liveness. No-op if the session has no scratch yet (nothing
 * meaningful captured), so it never creates an empty file.
 */
export function touchSession(sessionId?: string): void {
  const path = scratchPath(sessionId ?? "unknown");
  if (!existsSync(path)) return;
  try {
    const now = new Date();
    utimesSync(path, now, now);
  } catch {
    // best-effort: a failed touch just risks an early sweep, never blocks.
  }
}

/**
 * Read a single session's scratch WITHOUT deleting it — the session-end path.
 * Returns null when there's no scratch for that session. The caller enqueues
 * the digest and then calls discardScratch(session.path) so a failed enqueue
 * leaves the file for the next sweep instead of losing the session.
 */
export function readSession(sessionId?: string): ScratchSession | null {
  const id = sessionId ?? "unknown";
  const path = scratchPath(id);
  if (!existsSync(path)) return null;
  try {
    return toSession(path, id, parseScratchFile(path));
  } catch {
    // Unreadable: remove it so it can't wedge future sweeps.
    discardScratch(path);
    return null;
  }
}

/** Delete a consumed scratch file. Call only after its digest is durably spooled. */
export function discardScratch(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // best-effort: a stale file just gets re-swept next time.
  }
}

/**
 * Read every scratch file idle for longer than SCRATCH_IDLE_MS WITHOUT deleting
 * the still-valid ones — the SessionStart sweep. These are sessions that ended
 * without an end event (Codex) or crashed. Files too old to trust (>MAX_AGE) or
 * unreadable are deleted here (they are never enqueued); the returned ones are
 * deleted by the caller via discardScratch after their digest is spooled. The
 * CURRENT session's own file is excluded so a resumed session is never swept.
 */
export function sweepIdleSessions(args: {
  currentSessionId?: string;
  now?: number;
}): ScratchSession[] {
  const now = args.now ?? Date.now();
  const dir = scratchDir();
  const currentName = args.currentSessionId
    ? scratchFileName(args.currentSessionId)
    : undefined;
  const out: ScratchSession[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    if (currentName && name === currentName) continue;
    const path = join(dir, name);
    try {
      const ageMs = now - statSync(path).mtimeMs;
      if (ageMs < SCRATCH_IDLE_MS) continue;
      // Age is known from stat before any read: a file too old to trust
      // (crash-orphan that never digested) is deleted without wasting a full
      // read/parse — don't resurrect week-old work as a "new" memory.
      if (ageMs > SCRATCH_MAX_AGE_MS) {
        discardScratch(path);
        continue;
      }
      out.push(
        toSession(path, name.replace(/\.jsonl$/, ""), parseScratchFile(path)),
      );
    } catch {
      // best-effort: skip a file we can't read/stat this pass
    }
  }
  return out;
}
