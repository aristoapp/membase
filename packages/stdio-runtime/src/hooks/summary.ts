import { looksSensitive, truncateText } from "../sanitize/index.js";

const IMPORTANT_BASH_RE =
  /\b(bun|npm|pnpm|yarn|uv|pytest|cargo|go\s+test|make|docker|gcloud|vercel|wrangler|supabase|psql|prisma|drizzle|alembic|terraform|kubectl)\b|\bgit\s+(commit|merge|rebase|checkout|switch|push|pull|tag|reset|clean)\b|(?:^|\s)(rm|mv|cp|chmod|chown|mkdir|touch)\b/i;
const PASSIVE_BASH_RE =
  /^(pwd|ls|rg|grep|find|sed|cat|nl|wc|head|tail|git\s+(status|diff|log|show|branch))\b/i;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
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
    "exec",
  ];
  if (!allowed.includes(name)) return null;
  const input = objectValue(tool.tool_input ?? tool.input);

  if (name === "exec") {
    // Two hosts share this tool name. Codex CLI's native shell surfaces as
    // exec with a plain command payload; Codex Desktop routes shell work
    // through the node_repl plugin, whose payload is JavaScript source with
    // commands embedded as `tools.exec_command({"cmd": "..."})` calls. The
    // JS source is opaque code we cannot fully parse in a hook budget; JSON
    // string literals ARE a regular grammar, so scanning for "cmd" values
    // and JSON.parse-ing each literal is exact per literal and best-effort
    // per script. Every extracted command flows through the same
    // important/passive/secret filters as Bash.
    const rawInput = tool.tool_input ?? tool.input;
    const source =
      typeof rawInput === "string"
        ? rawInput
        : [input.input, input.code, input.command].find(
            (v): v is string => typeof v === "string",
          ) ?? "";
    if (!source || looksSensitive(source)) return null;
    const candidates: string[] = [];
    for (const match of source.matchAll(/"cmd"\s*:\s*("(?:[^"\\]|\\.)*")/g)) {
      try {
        candidates.push(JSON.parse(match[1] ?? '""') as string);
      } catch {}
    }
    // No embedded cmd literals → treat the whole payload as one plain shell
    // command (the CLI shape).
    if (candidates.length === 0) candidates.push(source);
    const commands: string[] = [];
    for (const candidate of candidates) {
      const truncated = truncateText(candidate, 160);
      if (!truncated || looksSensitive(truncated)) continue;
      if (
        PASSIVE_BASH_RE.test(truncated) ||
        !IMPORTANT_BASH_RE.test(truncated)
      ) {
        continue;
      }
      commands.push(truncated);
    }
    if (commands.length === 0) return null;
    return { files: [], commands, tasks: 0 };
  }

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
