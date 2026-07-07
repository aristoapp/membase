// Local handoff file (north-star pillar 2: same-client continuation is
// file-based). One rolling file per project under the plugin data dir;
// freshness comes from the file's mtime, so the content stays plain text.
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureDataDir } from "../config/index.js";

export interface LocalHandoff {
  text: string;
  storedAtMs: number;
}

export function handoffFilePath(projectSlug?: string): string {
  const dir = join(ensureDataDir(), "handoff");
  return join(dir, `${projectSlug || "unscoped"}.md`);
}

export function writeHandoffFile(summary: string, projectSlug?: string): void {
  const path = handoffFilePath(projectSlug);
  mkdirSync(join(ensureDataDir(), "handoff"), { recursive: true, mode: 0o700 });
  writeFileSync(path, summary, { encoding: "utf-8", mode: 0o600 });
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

/**
 * Client-specific lookup. Codex keeps its established workspace-scoped file
 * convention (written by the /handoff prompt); Claude uses the per-project
 * file under the plugin data dir (written by store_handoff).
 */
export function readLocalHandoff(args: {
  clientSource: string;
  cwd?: string;
  projectSlug?: string;
}): LocalHandoff | null {
  if (args.clientSource === "codex") {
    const candidates = process.env.MEMBASE_HANDOFF_FILE
      ? [process.env.MEMBASE_HANDOFF_FILE]
      : [
          join(args.cwd ?? process.cwd(), ".codex", "membase-handoff.md"),
          join(homedir(), ".codex", "membase-handoff.md"),
        ];
    for (const candidate of candidates) {
      const found = readAt(candidate);
      if (found) return found;
    }
    return null;
  }
  return readAt(handoffFilePath(args.projectSlug));
}
