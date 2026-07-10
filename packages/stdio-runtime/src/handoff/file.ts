// Local handoff file (same-client continuation is
// file-based). One rolling file per project under the plugin data dir;
// freshness comes from the file's mtime, so the content stays plain text.
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isHandoffFresh, writeTextAtomic } from "@membase/capture-core";
import { clientDescriptor } from "../clients.js";
import { ensureDataDir, getDataDir } from "../config/index.js";

export interface LocalHandoff {
  text: string;
  storedAtMs: number;
}

// Read path uses getDataDir (a pure join) rather than ensureDataDir so a
// SessionStart lookup does not mkdir/chmod as a side effect; a missing dir
// just ENOENTs into readAt's catch.
export function handoffFilePath(projectSlug?: string): string {
  return join(getDataDir(), "handoff", `${projectSlug || "unscoped"}.md`);
}

export function writeHandoffFile(summary: string, projectSlug?: string): void {
  // ensureDataDir re-asserts the 0700 data dir; writeTextAtomic then creates
  // the handoff/ subdir and writes atomically (tmp + rename) so a concurrent
  // SessionStart read never sees a torn file and a crash keeps the previous
  // handoff.
  ensureDataDir();
  writeTextAtomic(handoffFilePath(projectSlug), summary);
}

function readAt(path: string): LocalHandoff | null {
  try {
    const text = readFileSync(path, "utf-8").trim();
    if (!text) return null;
    return { text, storedAtMs: statSync(path).mtimeMs };
  } catch {
    return null;
  }
}

export function dotDirCandidates(dotDir: string, cwd?: string): string[] {
  if (process.env.MEMBASE_HANDOFF_FILE) return [process.env.MEMBASE_HANDOFF_FILE];
  // Prefer the live HOME env over os.homedir() (which some runtimes snapshot
  // at startup): the hook is launched with a fresh HOME, and this keeps
  // the home candidate in step with it.
  const home = process.env.HOME || homedir();
  return [
    join(cwd ?? process.cwd(), dotDir, "membase-handoff.md"),
    join(home, dotDir, "membase-handoff.md"),
  ];
}

/**
 * Client-specific lookup, driven by the client descriptor: a client with a
 * handoffDotDir (codex) keeps its established workspace-scoped file
 * convention (written by its /handoff prompt); the rest use the per-project
 * file under the plugin data dir (written by store_handoff).
 *
 * The first FRESH candidate wins so a stale project file cannot shadow a
 * fresher home file; if none is fresh, the most recent stale one is returned
 * (the caller still needs it to emit the stale notice).
 */
export function readLocalHandoff(args: {
  clientSource: string;
  cwd?: string;
  projectSlug?: string;
}): LocalHandoff | null {
  const dotDir = clientDescriptor(args.clientSource).handoffDotDir;
  const candidates = dotDir
    ? dotDirCandidates(dotDir, args.cwd)
    : [handoffFilePath(args.projectSlug)];
  let newestStale: LocalHandoff | null = null;
  for (const candidate of candidates) {
    const found = readAt(candidate);
    if (!found) continue;
    if (isHandoffFresh(found.storedAtMs)) return found;
    if (!newestStale || found.storedAtMs > newestStale.storedAtMs) {
      newestStale = found;
    }
  }
  return newestStale;
}
