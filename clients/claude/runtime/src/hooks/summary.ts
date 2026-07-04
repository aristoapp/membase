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

export function summarizeToolCall(
  tool: Record<string, unknown>,
): string | null {
  const name = String(tool.name ?? tool.tool_name ?? tool.type ?? "");
  if (!["Edit", "Write", "MultiEdit", "Bash", "Task", "Agent"].includes(name)) {
    return null;
  }
  const input = objectValue(tool.tool_input ?? tool.input);
  const path =
    typeof input.file_path === "string"
      ? input.file_path
      : typeof input.path === "string"
        ? input.path
        : undefined;
  const command =
    name === "Bash" && typeof input.command === "string"
      ? truncateText(input.command, 160)
      : undefined;
  if (name === "Bash") {
    if (!command || looksSensitive(command)) return null;
    if (PASSIVE_BASH_RE.test(command) || !IMPORTANT_BASH_RE.test(command)) {
      return null;
    }
  }
  return [
    `${name} tool used`,
    path ? `path: ${path}` : "",
    command ? `command: ${command}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSessionCaptureCandidate(
  raw: string,
  captureKind: "compact_summary",
): string {
  if (captureKind === "compact_summary") return sanitizeMembaseText(raw);
  return "";
}
