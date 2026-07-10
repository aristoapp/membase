#!/usr/bin/env node
// Cursor hooks.json adapter for shared auto-capture. Cursor's hook events and
// payload fields differ from the Claude/Codex shape, so this script only
// TRANSLATES: map the Cursor payload to the shared runtime's input, then
// pipe it into the hook.cjs bundled next to this file (which owns
// summarize/spool/flush) — the plugin package is self-contained.
// Dependency-free; auth-free unless a disk login exists (stdio bundle mode).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import fs from "node:fs";

const HOOK_BUNDLE = join(dirname(fileURLToPath(import.meta.url)), "hook.cjs");

/** Cursor event name → shared-runtime event name. */
// No beforeSubmitPrompt: Cursor has no context-injection output for it, so a
// mapped UserPromptSubmit recall fetch would be pure latency with the result
// thrown away.
export const EVENT_MAP = {
  sessionStart: "SessionStart",
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

// Never hang the host: resolve with whatever arrived after a short deadline
// if the stream errors or is left open (fail-open contract).
function readStdin() {
  return new Promise((resolvePromise) => {
    let data = "";
    let settled = false;
    let timer;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        process.stdin.destroy();
      } catch {}
      resolvePromise(data);
    };
    // Idle deadline, reset per chunk — never cuts an active stream.
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(done, 2000);
      timer.unref?.();
    };
    arm();
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      arm();
      if (data.length < 8_388_608) data += chunk;
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
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
    // stdout is piped so we can translate hook.cjs's Claude-shaped output into
    // Cursor's schema; stderr is inherited so failures stay observable.
    stdio: ["pipe", "pipe", "inherit"],
    // Precedence is deliberate: captureMode BEFORE the spread is a default the
    // ambient env may override; MEMBASE_CLIENT_SOURCE AFTER the spread so the
    // adapter's identity always wins over ambient env.
    env: {
      MEMBASE_CAPTURE_MODE: "summary",
      ...process.env,
      MEMBASE_CLIENT_SOURCE: "cursor",
    },
  });
  child.on("error", () => process.exit(0)); // fail-open on bad bundle path
  let out = "";
  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => {
    out += chunk;
  });
  child.stdin.write(JSON.stringify(mapCursorInput(event, input)));
  child.stdin.end();
  await new Promise((resolvePromise) => child.on("close", resolvePromise));
  // Cursor only accepts context on sessionStart, as {"additional_context":...}.
  // hook.cjs emits the Claude shape; translate it. All other events: silence.
  if (event !== "sessionStart") return;
  try {
    const context = JSON.parse(out)?.hookSpecificOutput?.additionalContext;
    if (typeof context === "string" && context) {
      process.stdout.write(JSON.stringify({ additional_context: context }));
    }
  } catch {
    // malformed/empty child output — print nothing
  }
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
