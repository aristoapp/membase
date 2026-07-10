// Host detection for the shared hooks file. One committed hook.cjs serves
// every stdio host from one root hooks.json, so per-client identity can no
// longer come from per-client command lines.
import type { HookInput } from "../types.js";

/**
 * An explicit MEMBASE_CLIENT_SOURCE (global-config installs, the
 * hooks/cursor-hook.mjs legacy adapter, tests) always wins. Cursor is
 * recognized by its payload fields; Codex by the plugin-root env var its hook
 * runner exposes (installers rewrite CLAUDE_PLUGIN_ROOT to CODEX_PLUGIN_ROOT
 * in hooks.json, and the host sets it for the process). Undetected = Claude
 * Code, the constants.ts default.
 */
export function detectClientSource(
  input: HookInput,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.MEMBASE_CLIENT_SOURCE) return undefined;
  if (
    "conversation_id" in input ||
    "workspace_roots" in input ||
    "cursor_version" in input
  ) {
    return "cursor";
  }
  if (env.CODEX_PLUGIN_ROOT) return "codex";
  return undefined;
}

/**
 * Map Cursor payload fields onto the shared HookInput shape (in place, so
 * unrecognized fields stay visible to the handler). Mirrors the legacy
 * hooks/cursor-hook.mjs adapter, which owns the same mapping for installs
 * wired through ~/.cursor/hooks.json.
 */
export function normalizeCursorInput(input: HookInput): HookInput {
  if (typeof input.session_id !== "string") {
    const conversationId = input.conversation_id;
    if (typeof conversationId === "string") input.session_id = conversationId;
  }
  if (typeof input.cwd !== "string") {
    const roots = input.workspace_roots;
    if (Array.isArray(roots) && typeof roots[0] === "string") {
      input.cwd = roots[0];
    }
  }
  return input;
}

export function parseHookInput(raw: string): HookInput {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as HookInput;
  } catch {
    // Invalid/truncated stdin (e.g. a host that stalled mid-payload): fall
    // back to an empty input so the event — driven by argv[2] — still runs
    // (handoff injection, spool announcement) instead of aborting the hook.
  }
  return {};
}
