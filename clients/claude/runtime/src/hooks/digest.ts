// Session digest builder (dreaming v2). One digest per session, aggregated
// from the tool observations spooled to the per-session scratch during the
// session — replacing the old per-tool-batch upload that produced dozens of
// contentless "used N tool(s)" memories. Privacy boundary is unchanged: only
// tool observations (files touched, meaningful commands, sub-agent counts) —
// never user prompts or assistant messages.
import type { ToolObservation } from "./summary.js";
import { CLIENT_LABEL } from "../constants.js";
import { truncateText } from "../sanitize/index.js";

// Caps keep a busy session's digest bounded and its recall useful.
const MAX_FILES = 20;
const MAX_COMMANDS = 15;

export interface SessionDigest {
  content: string;
  display_summary: string;
  fileCount: number;
  commandCount: number;
  taskCount: number;
}

// Dedupe preserving first-seen order; a session edits the same file many times.
function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * Fold a session's tool observations into one digest, or null when there is
 * nothing meaningful to record (an empty/idle session stays silent — no
 * placeholder memory). `dateLabel` is the day the session ran (YYYY-MM-DD).
 */
export function buildSessionDigest(args: {
  observations: ToolObservation[];
  project?: string;
  dateLabel: string;
}): SessionDigest | null {
  const files = uniq(args.observations.flatMap((o) => o.files));
  const commands = uniq(args.observations.flatMap((o) => o.commands));
  const tasks = args.observations.reduce((sum, o) => sum + o.tasks, 0);

  if (files.length === 0 && commands.length === 0 && tasks === 0) {
    return null;
  }

  const shownFiles = files.slice(0, MAX_FILES);
  const shownCommands = commands.slice(0, MAX_COMMANDS);
  const projectPart = args.project ? `, project: ${args.project}` : "";

  const lines: string[] = [
    `${CLIENT_LABEL} session digest (${args.dateLabel}${projectPart}):`,
  ];
  if (shownFiles.length) {
    const extra = files.length > shownFiles.length
      ? ` (+${files.length - shownFiles.length} more)`
      : "";
    lines.push(`Edited: ${shownFiles.join(", ")}${extra}`);
  }
  if (shownCommands.length) {
    const extra = commands.length > shownCommands.length
      ? ` (+${commands.length - shownCommands.length} more)`
      : "";
    lines.push(`Commands: ${shownCommands.join("; ")}${extra}`);
  }
  if (tasks > 0) {
    lines.push(`Sub-agent tasks: ${tasks}`);
  }

  const parts: string[] = [];
  if (files.length) parts.push(`${files.length} file(s)`);
  if (commands.length) parts.push(`${commands.length} command(s)`);
  if (tasks) parts.push(`${tasks} task(s)`);
  const summaryBody = `${CLIENT_LABEL} session: ${parts.join(", ")}${
    args.project ? ` — ${args.project}` : ""
  }`;

  return {
    content: lines.join("\n"),
    display_summary: truncateText(summaryBody, 180),
    fileCount: files.length,
    commandCount: commands.length,
    taskCount: tasks,
  };
}
