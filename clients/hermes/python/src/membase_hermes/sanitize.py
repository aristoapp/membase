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
SIMPLE_TAG_RE = re.compile(r"</?final>", re.IGNORECASE)
OPENCLAW_TIMESTAMP_PREFIX_RE = re.compile(
    r"^\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+GMT[+-]\d+\]\s*",
    re.IGNORECASE | re.MULTILINE,
)
SECRET_ASSIGNMENT_RE = re.compile(
    r"\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*[^\s`]+",
    re.IGNORECASE,
)
CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```")

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


def sanitize_membase_text(raw: str) -> str:
    cleaned = raw
    cleaned = OPENCLAW_TIMESTAMP_PREFIX_RE.sub(" ", cleaned)
    cleaned = MEMBASE_CONTEXT_BLOCK_RE.sub(" ", cleaned)
    cleaned = METADATA_BLOCK_RE.sub(" ", cleaned)
    cleaned = SIMPLE_TAG_RE.sub(" ", cleaned)
    lines = [line.strip() for line in cleaned.splitlines()]
    lines = [line for line in lines if line]
    return "\n".join(lines).strip()


def sanitize_recall_query(raw: str) -> str:
    cleaned = sanitize_membase_text(raw)
    cleaned = SECRET_ASSIGNMENT_RE.sub(r"\1=[REDACTED]", cleaned)
    cleaned = CODE_BLOCK_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:240]


def is_operational_message(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return True
    return any(pattern.search(trimmed) for pattern in HEARTBEAT_CONTROL_PATTERNS)
