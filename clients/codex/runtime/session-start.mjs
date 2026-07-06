#!/usr/bin/env node
// Codex SessionStart hook: inject the latest local Membase handoff, if any.
// File-based by design (implementation-overview §7.5): the hook never talks
// to membase, so it needs no auth — the /handoff custom prompt (see
// prompts/handoff.md) writes the file with the app's already-authenticated
// MCP tools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    const done = () => {
      // Stop reading so an open stdin can't keep the event loop alive.
      process.stdin.destroy();
      resolve(data);
    };
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
      // ponytail: the hook payload is a tiny JSON blob; a runaway stdin
      // (e.g. /dev/zero) would otherwise crash on string-length overflow.
      if (data.length > 1024 * 1024) done();
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
    // Fallback: if Codex spawns us without closing stdin, don't hang until
    // the hook timeout — use whatever arrived so far.
    setTimeout(done, 2000).unref();
  });
}

export function handoffCandidates(cwd, env = process.env, home = os.homedir()) {
  if (env.MEMBASE_HANDOFF_FILE) return [env.MEMBASE_HANDOFF_FILE];
  return [
    path.join(cwd, ".codex", "membase-handoff.md"),
    path.join(home, ".codex", "membase-handoff.md"),
  ];
}

export function readHandoff(candidates) {
  for (const file of candidates) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8").trim();
    } catch {
      continue;
    }
    if (text) return text;
  }
  return "";
}

export function buildHookOutput(text) {
  if (!text) return "";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `<membase-handoff>\n${text}\n</membase-handoff>`,
    },
  });
}

async function main() {
  const raw = await readStdin();
  let cwd = process.cwd();
  try {
    const input = JSON.parse(raw);
    if (typeof input.cwd === "string") cwd = input.cwd;
  } catch {
    // no/invalid stdin payload — fall back to process cwd
  }
  const output = buildHookOutput(readHandoff(handoffCandidates(cwd)));
  if (output) process.stdout.write(output);
}

// Node realpaths the main module, so import.meta.url is the resolved path.
// Realpath argv[1] too, or symlinked invocations would silently no-op.
let isMain = false;
try {
  isMain =
    !!process.argv[1] &&
    pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url;
} catch {
  // argv[1] missing or unreadable -> not the main module
}
if (isMain) {
  main().catch(() => process.exit(0));
}
