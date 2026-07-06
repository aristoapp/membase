#!/usr/bin/env node
// Cursor hooks.json adapter (north-star pillar 1). Cursor's hook events and
// payload fields differ from the Claude/Codex shape, so this script only
// TRANSLATES: map the Cursor payload to the shared runtime's input, then
// pipe it into the bundled hook.cjs (which owns summarize/spool/flush).
// Dependency-free; auth-free unless a disk login exists (stdio bundle mode).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import fs from "node:fs";

const HOOK_BUNDLE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "claude",
  "runtime",
  "plugin",
  "scripts",
  "hook.cjs",
);

/** Cursor event name → shared-runtime event name. */
export const EVENT_MAP = {
  sessionStart: "SessionStart",
  beforeSubmitPrompt: "UserPromptSubmit",
  afterFileEdit: "PostToolUse",
  afterShellExecution: "PostToolUse",
  stop: "Stop",
  sessionEnd: "SessionEnd",
};

/** Map a Cursor hook payload to the shared runtime's HookInput shape. */
export function mapCursorInput(event, input) {
  const mapped = {
    session_id: input.conversation_id ?? input.session_id,
    cwd:
      (Array.isArray(input.workspace_roots) && input.workspace_roots[0]) ||
      input.cwd ||
      process.cwd(),
  };
  if (event === "beforeSubmitPrompt") {
    mapped.prompt = typeof input.prompt === "string" ? input.prompt : "";
  }
  if (event === "afterFileEdit") {
    mapped.tool_name = "Edit";
    mapped.tool_input = { file_path: input.file_path };
  }
  if (event === "afterShellExecution") {
    const command =
      typeof input.command === "string"
        ? input.command
        : typeof input.tool_input === "object" && input.tool_input
          ? input.tool_input.command
          : undefined;
    mapped.tool_name = "Bash";
    mapped.tool_input = { command };
  }
  return mapped;
}

function readStdin() {
  return new Promise((resolvePromise) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolvePromise(data));
  });
}

async function main() {
  const event = process.argv[2];
  const target = EVENT_MAP[event];
  if (!target) return;
  let input = {};
  try {
    input = JSON.parse(await readStdin());
  } catch {
    // no/invalid stdin — run with defaults
  }
  const bundle = process.env.MEMBASE_HOOK_BUNDLE || HOOK_BUNDLE;
  const child = spawn(process.execPath, [bundle, target], {
    stdio: ["pipe", "inherit", "ignore"],
    env: {
      MEMBASE_CLIENT_SOURCE: "cursor",
      CLAUDE_PLUGIN_OPTION_captureMode: "summary",
      ...process.env,
    },
  });
  child.stdin.write(JSON.stringify(mapCursorInput(event, input)));
  child.stdin.end();
  await new Promise((resolvePromise) => child.on("close", resolvePromise));
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return (
      resolve(fs.realpathSync(process.argv[1])) ===
      fileURLToPath(import.meta.url)
    );
  } catch {
    return false;
  }
})();
if (isMain) {
  main().catch(() => process.exit(0));
}
