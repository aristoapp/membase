import {
  looksSensitive,
  sanitizeMembaseText,
  truncateText,
} from "../sanitize/index.js";

const IMPORTANT_BASH_RE =
  /\b(bun|npm|pnpm|yarn|uv|pytest|cargo|go\s+test|make|docker|gcloud|vercel|wrangler|supabase|psql|prisma|drizzle|alembic|terraform|kubectl)\b|\bgit\s+(commit|merge|rebase|checkout|switch|push|pull|tag|reset|clean)\b|(?:^|\s)(rm|mv|cp|chmod|chown|mkdir|touch)\b/i;
const PASSIVE_BASH_RE =
  /^(pwd|ls|rg|grep|find|sed|cat|nl|wc|head|tail|git\s+(status|diff|log|show|branch))\b/i;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

// Only compact_summary flows through here today; sanitize the raw compact
// summary for capture. (Kept as a named seam in case other kinds need
// candidate shaping later.)
export function buildSessionCaptureCandidate(raw: string): string {
  return sanitizeMembaseText(raw);
}

// One structured observation drawn from a single tool call — the raw material
// for a session digest. Filters to meaningful tools only (allowed list,
// important-vs-passive Bash, secret rejection) and yields fields to aggregate
// across a session, never per-call text.
export interface ToolObservation {
  /** File paths touched (Edit/Write path, or apply_patch's file list). */
  files: string[];
  /** Meaningful shell commands (already truncated + secret-filtered). */
  commands: string[];
  /** Sub-agent task launches (Task/Agent). */
  tasks: number;
}

export function extractToolObservation(
  tool: Record<string, unknown>,
): ToolObservation | null {
  const name = String(tool.name ?? tool.tool_name ?? tool.type ?? "");
  const allowed = [
    "Edit",
    "Write",
    "MultiEdit",
    "Bash",
    "Task",
    "Agent",
    "apply_patch",
  ];
  if (!allowed.includes(name)) return null;
  const input = objectValue(tool.tool_input ?? tool.input);

  if (name === "Task" || name === "Agent") {
    return { files: [], commands: [], tasks: 1 };
  }

  if (name === "Bash") {
    const command =
      typeof input.command === "string"
        ? truncateText(input.command, 160)
        : undefined;
    if (!command || looksSensitive(command)) return null;
    if (PASSIVE_BASH_RE.test(command) || !IMPORTANT_BASH_RE.test(command)) {
      return null;
    }
    return { files: [], commands: [command], tasks: 0 };
  }

  if (name === "apply_patch") {
    const patch = typeof input.command === "string" ? input.command : "";
    if (looksSensitive(patch)) return null;
    const files = Array.from(
      patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm),
      (match) => match[1] ?? "",
    )
      .filter(Boolean)
      // Cap per patch so a giant generated mono-patch can't bloat the scratch
      // line (the digest only ever shows 20; well above that is enough).
      .slice(0, 50);
    if (files.length === 0) return null;
    return { files, commands: [], tasks: 0 };
  }

  // Edit / Write / MultiEdit — a single file path. Reject a sensitive path
  // (e.g. an edit of `.env`) here so it never reaches the on-disk scratch —
  // matching the Bash/apply_patch branches. The digest-time filter only keeps
  // it out of the upload, not off local disk.
  const path =
    typeof input.file_path === "string"
      ? input.file_path
      : typeof input.path === "string"
        ? input.path
        : undefined;
  if (!path || looksSensitive(path)) return null;
  return { files: [path], commands: [], tasks: 0 };
}
