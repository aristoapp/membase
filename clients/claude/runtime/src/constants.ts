export const PLUGIN_NAME = "claude-membase";
export const PLUGIN_VERSION = "0.1.4";
export const DEFAULT_API_URL = "https://api.membase.so";
export const DEFAULT_MCP_URL = "https://mcp.membase.so/mcp";
// The bundled stdio server/hook binaries are shared by other stdio-bundled
// clients (north-star pillar 1): MEMBASE_CLIENT_SOURCE overrides memory
// source attribution and the user agent without a separate build. Unset =
// Claude Code behavior, byte-identical requests.
// Interpolated into the User-Agent header: reject anything outside a safe
// token charset (unicode/newlines make every fetch throw an opaque TypeError).
const RAW_CLIENT_SOURCE = process.env.MEMBASE_CLIENT_SOURCE;
const CLIENT_SOURCE =
  RAW_CLIENT_SOURCE && /^[a-z0-9-]{1,32}$/.test(RAW_CLIENT_SOURCE)
    ? RAW_CLIENT_SOURCE
    : "claude-code";
export const MEMORY_SOURCE = CLIENT_SOURCE;
export const USER_AGENT = `membase-${CLIENT_SOURCE}/${PLUGIN_VERSION}`;
// Ingest metadata provenance must follow the client source: "claude-membase"
// is the Claude Code plugin; other bundle clients get a derived label.
export const INGEST_PLUGIN_LABEL =
  CLIENT_SOURCE === "claude-code"
    ? PLUGIN_NAME
    : `membase-bundle-${CLIENT_SOURCE}`;
const CLIENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};
export const CLIENT_LABEL = CLIENT_LABELS[CLIENT_SOURCE] ?? CLIENT_SOURCE;
export const DEFAULT_RECALL_TIMEOUT_MS = 3_000;
export const DEFAULT_MAX_RECALL_CHARS = 4_000;
export const MAX_RECALL_CHARS = 16_000;
export const MIN_RECALL_CHARS = 500;
export const PREFETCH_MEMORY_LIMIT = 10;
export const PREFETCH_PROJECT_MEMORY_LIMIT = 7;
export const PREFETCH_BROADER_MEMORY_LIMIT = 4;
export const PREFETCH_WIKI_LIMIT = 5;
