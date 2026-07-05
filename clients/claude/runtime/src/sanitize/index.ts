// Claude-runtime sanitize surface, now composed from @membase/capture-core
// (ADR 0002 / D1). Public API and behavior are unchanged; only the shared
// primitives moved to the core. Claude-specific pieces stay here: the
// <private> block, the smaller memory-keyword list, empty-input-is-casual,
// and the operational heartbeat patterns.
import {
  clampRecallQuery,
  isCasualChat as coreIsCasualChat,
  normalizeLines,
  looksSensitive as coreLooksSensitive,
  redactSecrets,
  stripContextBlocks,
  truncateText as coreTruncateText,
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
  "decision",
  "preference",
  "project",
  "architecture",
  "deploy",
  "release",
  "migration",
  "refactor",
  "deadline",
  "bug",
  "issue",
  "error",
];

const PRIVATE_BLOCK_RE = /<(private|membase-private)>[\s\S]*?<\/\1>\s*/gi;

const OPERATIONAL_PATTERNS = [
  /^heartbeat$/i,
  /^heartbeat_ok$/i,
  /^heartbeat ok$/i,
  /^heartbeat:\s*(ok|idle|noop)$/i,
  /^heartbeat ping$/i,
  /^heartbeat check$/i,
  /\bcheck\s+heartbeat\.md\b/i,
];

export function sanitizeMembaseText(raw: string): string {
  const cleaned = redactSecrets(
    stripContextBlocks(raw.replace(PRIVATE_BLOCK_RE, " ")),
  );
  return normalizeLines(cleaned);
}

export function sanitizeRecallQuery(raw: string): string {
  return clampRecallQuery(sanitizeMembaseText(raw));
}

export function isCasualChat(text: string): boolean {
  return coreIsCasualChat(text, MEMORY_KEYWORDS, true);
}

export function isOperationalMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return OPERATIONAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export const looksSensitive = coreLooksSensitive;
export const truncateText = coreTruncateText;
