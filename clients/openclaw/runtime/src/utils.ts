// OpenClaw-runtime text utilities, now composed from @membase/capture-core
// (ADR 0002 / D1). OpenClaw-specific pieces stay here: the gateway timestamp
// prefix, heartbeat noise lines, the larger memory-keyword list, and event
// extraction helpers.
//
// Redaction convergence (2026-07-05): the capture path now applies the full
// capture-core secret redaction rule set before anything leaves the machine,
// reconciling the D1 slice 1 divergence toward the Claude policy. The
// recall-query path keeps its narrower assignment-only redaction (basic
// keyword set) — full recall reconciliation stays in D2.
import {
  buildSecretAssignmentRe,
  clampRecallQuery,
  isCasualChat as coreIsCasualChat,
  normalizeLines,
  redactSecrets,
  SECRET_ASSIGNMENT_KEYWORDS_BASIC,
  stripContextBlocks,
} from "@membase/capture-core";

const MEMORY_KEYWORDS = [
  "remember",
  "recall",
  "forgot",
  "forget",
  "last time",
  "previously",
  "before",
  "history",
  "decide",
  "decision",
  "chose",
  "choice",
  "plan",
  "goal",
  "project",
  "preference",
  "setting",
  "config",
  "deploy",
  "release",
  "migration",
  "refactor",
  "architecture",
  "deadline",
  "schedule",
  "budget",
  "fix",
  "bug",
  "issue",
  "error",
];

const HEARTBEAT_NOISE_LINE_PATTERNS = [
  /read heartbeat\.md if it exists \(workspace context\)/i,
  /when reading heartbeat\.md, use workspace file/i,
  /if nothing needs attention,\s*reply heartbeat_ok/i,
  /do not infer or repeat old tasks from prior chats/i,
  /^current time:/i,
  /^gateway reconnected\b/i,
  /^agent main \| session main \(heartbeat\)/i,
  /^[-─]{8,}$/i,
];

const SECRET_ASSIGNMENT_RE = buildSecretAssignmentRe(
  SECRET_ASSIGNMENT_KEYWORDS_BASIC,
);

// OpenClaw prepends a timestamp to every user message, e.g. "[Mon 2026-03-23 15:19 GMT+9] "
const OPENCLAW_TIMESTAMP_PREFIX_RE =
  /^\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]\s*/gim;

export function isCasualChat(text: string): boolean {
  return coreIsCasualChat(text, MEMORY_KEYWORDS);
}

export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Record<string, unknown>[])
      .filter((c) => c.type === "text")
      .map((c) => c.text as string)
      .join("\n");
  }
  return "";
}

export function sanitizeMembaseText(raw: string): string {
  const cleaned = stripContextBlocks(
    raw.replace(OPENCLAW_TIMESTAMP_PREFIX_RE, " "),
  );
  return normalizeLines(cleaned, (line) =>
    HEARTBEAT_NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)),
  );
}

/**
 * Capture-path sanitizer: strip OpenClaw noise, then redact secrets with the
 * full capture-core rule set (private keys, assignments, bearer tokens, CLI
 * secret flags, provider token formats). Secrets must be filtered before the
 * text leaves the machine (ADR 0002 §3 hard client-side residue).
 */
export function sanitizeCaptureText(raw: string): string {
  return redactSecrets(sanitizeMembaseText(raw));
}

export function sanitizeRecallQuery(raw: string): string {
  const cleaned = sanitizeMembaseText(raw).replace(
    SECRET_ASSIGNMENT_RE,
    "$1=[REDACTED]",
  );
  return clampRecallQuery(cleaned);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Handoff tagging. A literal string prefix (not a server-side field) so any
 * client's plain search_memory call can find a handoff by tag alone.
 *
 * The tag MUST live on a field the search bundle exposes — the episode name /
 * summary — not just the ingested content body: the bundle carries `name` and
 * `summary` but not the raw body (see NodeResponse in types.ts). The backend
 * derives the episode name from `display_summary` (graph_sync.py:298 →
 * build_safe_episode_name(display_title or display_summary or content)), so
 * `buildHandoffDisplaySummary` prefixes the tag there and `isHandoffMemory`
 * matches against `episode.name`/`episode.summary`.
 */
export const HANDOFF_TAG = "[HANDOFF]";

// display_summary max_length on the backend (models/ingest.py) is 500; the tag
// + scope is short, so clamp the user summary to leave headroom.
const HANDOFF_SUMMARY_MAX = 400;

export function handoffRecallQuery(): string {
  return `${HANDOFF_TAG} session handoff summary`;
}

export function buildHandoffMemory(args: {
  summary: string;
  project?: string;
}): string {
  const scope = args.project ? ` (${args.project})` : "";
  return `${HANDOFF_TAG}${scope} ${args.summary}`.trim();
}

/**
 * The tagged display_summary. The backend uses this as the episode name, so it
 * is what recall's `isHandoffMemory(episode.name)` check sees — keep the tag at
 * the very start.
 */
export function buildHandoffDisplaySummary(args: {
  summary: string;
  project?: string;
}): string {
  const scope = args.project ? ` (${args.project})` : "";
  const clipped = args.summary.trim().slice(0, HANDOFF_SUMMARY_MAX);
  return `${HANDOFF_TAG}${scope} ${clipped}`.trim();
}

export function isHandoffMemory(text: string): boolean {
  return text.trimStart().startsWith(HANDOFF_TAG);
}

/**
 * Pick the newest handoff from a relevance-ranked bundle list. Search returns
 * bundles ordered by relevance, not recency, so "most recent handoff" must sort
 * by event/capture time explicitly. Non-handoff bundles (that leaked into the
 * generic-query results) are filtered out first.
 */
export function pickLatestHandoff<
  T extends {
    episode: {
      name?: string | null;
      summary?: string | null;
      valid_at?: string | null;
      created_at?: string | null;
    };
  },
>(bundles: T[]): T | undefined {
  const handoffs = bundles.filter(
    (b) =>
      isHandoffMemory(b.episode.name ?? "") ||
      isHandoffMemory(b.episode.summary ?? ""),
  );
  if (handoffs.length === 0) return undefined;
  const time = (b: T): number => {
    const raw = b.episode.valid_at ?? b.episode.created_at ?? "";
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  };
  return handoffs.reduce((latest, b) => (time(b) > time(latest) ? b : latest));
}

export function extractLastUserMessage(event: Record<string, unknown>): string {
  const messages = event.messages;
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as Record<string, unknown> | undefined;
      if (msg?.role === "user") {
        if (typeof msg.content === "string") return msg.content;
        if (Array.isArray(msg.content)) {
          return (msg.content as Record<string, unknown>[])
            .filter((c) => c.type === "text")
            .map((c) => c.text as string)
            .join(" ");
        }
      }
    }
  }

  if (typeof event.prompt === "string") return event.prompt;
  return "";
}
