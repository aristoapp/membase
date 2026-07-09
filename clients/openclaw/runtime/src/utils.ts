// OpenClaw-runtime text utilities, now composed from @membase/capture-core
// OpenClaw-specific pieces stay here: the gateway timestamp
// prefix, heartbeat noise lines, the larger memory-keyword list, and event
// extraction helpers.
//
// Redaction convergence (2026-07-05): the capture path now applies the full
// capture-core secret redaction rule set before anything leaves the machine,
// reconciling the historical divergence toward the Claude policy. The
// recall-query path keeps its narrower assignment-only redaction (basic
// keyword set) — full recall reconciliation is future work.
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
 * text leaves the machine (credentials must never leave the client).
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
