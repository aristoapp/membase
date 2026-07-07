// Per-session tool-observation scratch (dreaming v2). This is NOT the upload
// spool: nothing here is ever a memory on its own. Each session appends its
// meaningful tool observations to `scratch/<session_id>.jsonl` during the
// session; at session end (or, for a session with no end event, the next
// SessionStart sweep) the observations are folded into ONE digest and enqueued
// to the real spool, then the scratch file is deleted. Lives under the same
// data dir as the spool but in a separate `scratch/` subdir so it never
// pollutes pending.jsonl.
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
// ponytail: bounds the common crash-orphan case; a machine that turns capture
// off forever keeps at most its final summary-mode session's files (sweep runs
// only in summary mode) — acceptable, not worth an unconditional prune pass.
export const SCRATCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ScratchMeta {
  meta: true;
  project?: string;
  client_source?: string;
  cwd?: string;
  started_at: string;
}

function scratchDir(): string {
  const dir = join(ensureDataDir(), "scratch");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // mkdirSync's mode only applies on creation; a dir made earlier (looser
  // umask, older version) keeps its perms. chmod so the 0o700 intent holds.
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best-effort: a chmod failure (e.g. non-owner) must not break capture.
  }
  return dir;
}

// session_id comes from the host; keep the filename to a safe charset so a
// hostile/odd id can't escape the scratch dir.
function scratchPath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
  return join(scratchDir(), `${safe || "unknown"}.jsonl`);
}

/**
 * Append one tool observation for a session. Writes a meta header line the
 * first time it sees a session file so a later sweep knows the project/client
 * without re-deriving them. Observations carry only tool metadata (paths,
 * commands) — already secret-filtered by extractToolObservation and
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
    if (!existsSync(path)) {
      const meta: ScratchMeta = {
        meta: true,
        project: args.project,
        client_source: args.clientSource,
        cwd: args.cwd,
        started_at: new Date().toISOString(),
      };
      lines.push(JSON.stringify(meta));
    }
    // Sanitize command strings once more before they touch disk.
    const safe: ToolObservation = {
      files: args.observation.files.map((f) => sanitizeMembaseText(f)),
      commands: args.observation.commands.map((c) => sanitizeMembaseText(c)),
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

export interface ScratchSession {
  sessionId: string;
  project?: string;
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

function parseScratchFile(path: string): {
  meta: ScratchMeta | null;
  observations: ToolObservation[];
} {
  const raw = readFileSync(path, "utf-8").trim();
  let meta: ScratchMeta | null = null;
  const observations: ToolObservation[] = [];
  if (!raw) return { meta, observations };
  for (const line of raw.split(/\r?\n/)) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.meta === true) {
        meta = parsed as unknown as ScratchMeta;
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
  return { meta, observations };
}

/**
 * Read and CONSUME (delete) a single session's scratch — the session-end path.
 * Returns null when there's no scratch for that session. The file is deleted
 * even if it holds no observations, so an empty session leaves nothing behind.
 */
export function takeSession(sessionId?: string): ScratchSession | null {
  const path = scratchPath(sessionId ?? "unknown");
  if (!existsSync(path)) return null;
  try {
    const { meta, observations } = parseScratchFile(path);
    rmSync(path, { force: true });
    return {
      sessionId: sessionId ?? "unknown",
      project: meta?.project,
      cwd: meta?.cwd,
      startedAt: meta?.started_at,
      observations,
    };
  } catch {
    // Unreadable: remove it so it can't wedge future sweeps.
    try {
      rmSync(path, { force: true });
    } catch {}
    return null;
  }
}

/**
 * Read and CONSUME every scratch file idle for longer than SCRATCH_IDLE_MS —
 * the SessionStart sweep. These are sessions that ended without an end event
 * (Codex) or crashed. The CURRENT session's own file (if it exists yet) is
 * excluded so a resumed session is never swept mid-flight.
 */
export function sweepIdleSessions(args: {
  currentSessionId?: string;
  now?: number;
}): ScratchSession[] {
  const now = args.now ?? Date.now();
  const dir = scratchDir();
  const currentPath = args.currentSessionId
    ? scratchPath(args.currentSessionId)
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
    const path = join(dir, name);
    if (currentPath && path === currentPath) continue;
    try {
      const ageMs = now - statSync(path).mtimeMs;
      if (ageMs < SCRATCH_IDLE_MS) continue;
      const { meta, observations } = parseScratchFile(path);
      rmSync(path, { force: true });
      // A file too old to trust (crash-orphan that never digested) is deleted
      // but not returned — don't resurrect week-old work as a "new" memory.
      if (ageMs > SCRATCH_MAX_AGE_MS) continue;
      out.push({
        sessionId: name.replace(/\.jsonl$/, ""),
        project: meta?.project,
        cwd: meta?.cwd,
        startedAt: meta?.started_at,
        observations,
      });
    } catch {
      // best-effort: skip a file we can't read/stat this pass
    }
  }
  return out;
}
