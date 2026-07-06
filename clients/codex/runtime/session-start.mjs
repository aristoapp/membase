#!/usr/bin/env node
// Codex SessionStart hook: inject the latest local Membase handoff, if any.
// File-based by design (implementation-overview §7.5): the hook never talks
// to membase, so it needs no auth — the /handoff custom prompt (see
// prompts/handoff.md) writes the file with the app's already-authenticated
// MCP tools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
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

// URL.pathname percent-encodes spaces/non-ASCII, so compare decoded paths.
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(() => process.exit(0));
}
