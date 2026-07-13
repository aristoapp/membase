from __future__ import annotations

import re

CASUAL_PATTERNS = [
    re.compile(r"^(hi|hey|hello|yo|sup|hola|howdy|hiya|heya)\b"),
    re.compile(r"^(good\s*(morning|afternoon|evening|night))\b"),
    re.compile(r"^(thanks|thank you|thx|ty)\b"),
    re.compile(r"^(ok|okay|sure|got it|sounds good|cool|nice|great|awesome|perfect)\b"),
    re.compile(r"^(bye|goodbye|see you|later|gn|ttyl)\b"),
    re.compile(r"^(yes|no|yep|nope|yeah|nah)\b"),
    re.compile(r"^(lol|lmao|haha|heh)\b"),
    re.compile(r"^(how are you|what's up|whats up|wassup)\b"),
]

MEMORY_KEYWORDS = [
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
]

METADATA_BLOCK_RE = re.compile(
    r"(sender|conversation info)\s*\(untrusted metadata\):\s*(?:```json[\s\S]*?```|json\s*\{[\s\S]*?\})",
    re.IGNORECASE,
)
MEMBASE_CONTEXT_BLOCK_RE = re.compile(r"<membase-context>[\s\S]*?</membase-context>\s*", re.IGNORECASE)
MEMBASE_HANDOFF_BLOCK_RE = re.compile(r"<membase-handoff\b[^>]*>[\s\S]*?</membase-handoff>\s*", re.IGNORECASE)
SIMPLE_TAG_RE = re.compile(r"</?final>", re.IGNORECASE)
OPENCLAW_TIMESTAMP_PREFIX_RE = re.compile(
    r"^\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]\s*",
    re.IGNORECASE | re.MULTILINE,
)
# The keyword must be a whole UPPER_SNAKE segment: optional PREFIX_ segments,
# the keyword, optional _SUFFIX segments, then a non-identifier boundary. This
# keeps whole-token secret names (MEMBASE_API_KEY, TOKEN) matching but rejects
# max_tokens (TOKEN as an infix of a longer lowercase word).
SECRET_ASSIGNMENT_RE = re.compile(
    r"(?<![A-Za-z0-9_])"
    r"((?:[A-Za-z0-9]+_)*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)(?:_[A-Za-z0-9]+)*)"
    r"(?![A-Za-z0-9])"
    r"\s*=\s*[^\s`]+",
    re.IGNORECASE,
)
# A real dotenv reference (`.env`, `.env.local`), not a `process.env.X` property
# access (keyword preceded by an alnum) nor a `.env.example` placeholder file.
DOTENV_REF_RE = re.compile(
    r"(?<![A-Za-z0-9])\.env"
    r"(?!\.(?:example|sample|template)\b)"
    r"(?:\.[A-Za-z0-9_-]+)?"
    r"(?![A-Za-z0-9])",
    re.IGNORECASE,
)
PRIVATE_BLOCK_RE = re.compile(r"<(private|membase-private)>[\s\S]*?</\1>\s*", re.IGNORECASE)
BEARER_TOKEN_RE = re.compile(r"\b(authorization:\s*bearer\s+)[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
CLI_SECRET_FLAG_RE = re.compile(
    r"((?:^|\s)--(?:api-key|apikey|token|secret|password|pat|key)(?:=|\s+))[^\s`]+",
    re.IGNORECASE,
)
COMMON_TOKEN_RE = re.compile(
    r"\b(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b",
)
PRIVATE_KEY_RE = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
)
CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```")
INJECTION_TAG_RE = re.compile(
    r"</?(membase-[a-z-]+|system-reminder)\b",
    re.IGNORECASE,
)

HEARTBEAT_CONTROL_PATTERNS = [
    re.compile(r"^heartbeat$", re.IGNORECASE),
    re.compile(r"^heartbeat_ok$", re.IGNORECASE),
    re.compile(r"^heartbeat ok$", re.IGNORECASE),
    re.compile(r"^heartbeat:\s*(ok|idle|noop)$", re.IGNORECASE),
    re.compile(r"^heartbeat ping$", re.IGNORECASE),
    re.compile(r"^heartbeat check$", re.IGNORECASE),
    re.compile(r"\bcheck\s+heartbeat\.md\b", re.IGNORECASE),
]


def is_casual_chat(text: str) -> bool:
    lower = text.lower().strip()
    if not lower:
        return True
    if "?" in lower:
        return False
    if any(keyword in lower for keyword in MEMORY_KEYWORDS):
        return False
    return any(pattern.search(lower) for pattern in CASUAL_PATTERNS)


def neutralize_injection(text: str) -> str:
    """Port of capture-core's neutralizeInjection (golden-vector-bound).

    Untrusted memory text interpolated into a <membase-context> block must not
    be able to close the block early or forge a membase-*/system-reminder tag.
    A zero-width space (U+200B) after "<" keeps the text readable but the tag
    inert; idempotent because a neutralized tag no longer matches.
    """
    return INJECTION_TAG_RE.sub(lambda m: m.group(0)[0] + "\u200b" + m.group(0)[1:], text)


def sanitize_membase_text(raw: str) -> str:
    cleaned = raw
    cleaned = OPENCLAW_TIMESTAMP_PREFIX_RE.sub(" ", cleaned)
    cleaned = PRIVATE_BLOCK_RE.sub(" ", cleaned)
    cleaned = MEMBASE_CONTEXT_BLOCK_RE.sub(" ", cleaned)
    cleaned = MEMBASE_HANDOFF_BLOCK_RE.sub(" ", cleaned)
    cleaned = METADATA_BLOCK_RE.sub(" ", cleaned)
    cleaned = PRIVATE_KEY_RE.sub("[REDACTED_PRIVATE_KEY]", cleaned)
    cleaned = SECRET_ASSIGNMENT_RE.sub(r"\1=[REDACTED]", cleaned)
    cleaned = BEARER_TOKEN_RE.sub(r"\1[REDACTED]", cleaned)
    cleaned = CLI_SECRET_FLAG_RE.sub(r"\1[REDACTED]", cleaned)
    cleaned = COMMON_TOKEN_RE.sub("[REDACTED_TOKEN]", cleaned)
    cleaned = SIMPLE_TAG_RE.sub(" ", cleaned)
    # Pair-removal above misses standalone/unbalanced tags; neutralize the
    # leftovers so they cannot terminate the provider's context block.
    cleaned = neutralize_injection(cleaned)
    lines = [line.strip() for line in cleaned.splitlines()]
    lines = [line for line in lines if line]
    return "\n".join(lines).strip()


def sanitize_capture_text(raw: str) -> str:
    """Capture-path sanitizer: strip tags/blocks, then redact secrets.

    Mirrors the OpenClaw runtime's sanitizeCaptureText
    (redactSecrets(sanitizeMembaseText(raw))). Used before a capture is written
    to the failure-path disk spool, so credentials never reach disk.
    Unlike sanitize_recall_query it does NOT collapse whitespace or clamp
    length — the stored capture keeps its shape.
    """
    cleaned = sanitize_membase_text(raw)
    return SECRET_ASSIGNMENT_RE.sub(r"\1=[REDACTED]", cleaned)


def sanitize_recall_query(raw: str) -> str:
    cleaned = sanitize_membase_text(raw)
    cleaned = SECRET_ASSIGNMENT_RE.sub(r"\1=[REDACTED]", cleaned)
    cleaned = CODE_BLOCK_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:240]


def looks_sensitive(text: str) -> bool:
    return bool(
        SECRET_ASSIGNMENT_RE.search(text)
        or BEARER_TOKEN_RE.search(text)
        or CLI_SECRET_FLAG_RE.search(text)
        or COMMON_TOKEN_RE.search(text)
        or PRIVATE_KEY_RE.search(text)
        or DOTENV_REF_RE.search(text)
    )


def is_operational_message(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return True
    return any(pattern.search(trimmed) for pattern in HEARTBEAT_CONTROL_PATTERNS)
