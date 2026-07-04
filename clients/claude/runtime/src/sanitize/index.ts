const CASUAL_PATTERNS = [
  /^(hi|hey|hello|yo|sup|hola|howdy|hiya|heya)\b/i,
  /^(good\s*(morning|afternoon|evening|night))\b/i,
  /^(thanks|thank you|thx|ty)\b/i,
  /^(ok|okay|sure|got it|sounds good|cool|nice|great|awesome|perfect)\b/i,
  /^(bye|goodbye|see you|later|gn|ttyl)\b/i,
  /^(yes|no|yep|nope|yeah|nah)\b/i,
  /^(lol|lmao|haha|heh)\b/i,
  /^(how are you|what's up|whats up|wassup)\b/i,
];

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

const MEMBASE_CONTEXT_BLOCK_RE =
  /<membase-context>[\s\S]*?<\/membase-context>\s*/gi;
const PRIVATE_BLOCK_RE = /<(private|membase-private)>[\s\S]*?<\/\1>\s*/gi;
const METADATA_BLOCK_RE =
  /(sender|conversation info)\s*\(untrusted metadata\):\s*(?:```json[\s\S]*?```|json\s*\{[\s\S]*?\})/gi;
const SECRET_ASSIGNMENT_RE =
  /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*[^\s`]+/gi;
const BEARER_TOKEN_RE = /\b(authorization:\s*bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const CLI_SECRET_FLAG_RE =
  /((?:^|\s)--(?:api-key|apikey|token|secret|password|pat|key)(?:=|\s+))[^\s`]+/gi;
const COMMON_TOKEN_RE =
  /\b(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g;
const PRIVATE_KEY_RE =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const SIMPLE_TAG_RE = /<\/?final>/gi;

const OPERATIONAL_PATTERNS = [
  /^heartbeat$/i,
  /^heartbeat_ok$/i,
  /^heartbeat ok$/i,
  /^heartbeat:\s*(ok|idle|noop)$/i,
  /^heartbeat ping$/i,
  /^heartbeat check$/i,
  /\bcheck\s+heartbeat\.md\b/i,
];

function patternTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

export function sanitizeMembaseText(raw: string): string {
  let cleaned = raw;
  cleaned = cleaned.replace(PRIVATE_BLOCK_RE, " ");
  cleaned = cleaned.replace(MEMBASE_CONTEXT_BLOCK_RE, " ");
  cleaned = cleaned.replace(METADATA_BLOCK_RE, " ");
  cleaned = cleaned.replace(PRIVATE_KEY_RE, "[REDACTED_PRIVATE_KEY]");
  cleaned = cleaned.replace(SECRET_ASSIGNMENT_RE, "$1=[REDACTED]");
  cleaned = cleaned.replace(BEARER_TOKEN_RE, "$1[REDACTED]");
  cleaned = cleaned.replace(CLI_SECRET_FLAG_RE, "$1[REDACTED]");
  cleaned = cleaned.replace(COMMON_TOKEN_RE, "[REDACTED_TOKEN]");
  cleaned = cleaned.replace(SIMPLE_TAG_RE, " ");
  return cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function sanitizeRecallQuery(raw: string): string {
  return sanitizeMembaseText(raw)
    .replace(CODE_BLOCK_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function isCasualChat(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return true;
  if (lower.includes("?") || MEMORY_KEYWORDS.some((kw) => lower.includes(kw))) {
    return false;
  }
  return CASUAL_PATTERNS.some((pattern) => pattern.test(lower));
}

export function isOperationalMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return OPERATIONAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function looksSensitive(text: string): boolean {
  return (
    patternTest(SECRET_ASSIGNMENT_RE, text) ||
    patternTest(BEARER_TOKEN_RE, text) ||
    patternTest(CLI_SECRET_FLAG_RE, text) ||
    patternTest(COMMON_TOKEN_RE, text) ||
    patternTest(PRIVATE_KEY_RE, text) ||
    /\.env(\.|$|\s)/i.test(text)
  );
}

export function truncateText(
  value: string | null | undefined,
  max = 500,
): string {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}
