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

// Never hang the host: resolve with whatever arrived after a short idle
// deadline if the host leaves stdin open (fail-open, same contract as the
// Claude/Cursor hooks). Codex kills the hook at its own timeout anyway, but a
// hung read would still block session start until then.
function readStdin() {
  return new Promise((resolve) => {
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
      resolve(data);
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
      data += chunk;
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
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

// The handoff text is interpolated into a <membase-handoff> block and can come
// from a checked-in repo file (.codex/membase-handoff.md), so it must not be
// able to close the block early or forge the harness's system-reminder tag.
// Insert a zero-width space after the "<" of those delimiters; the text stays
// readable, the tags inert. Inlined (not imported from capture-core) to keep
// this hook dependency-free — it runs as a bare `node …/session-start.mjs`.
function neutralizeInjection(text) {
  return text.replace(
    /<\/?(membase-handoff|system-reminder)\b/gi,
    (m) => `${m[0]}​${m.slice(1)}`,
  );
}

export function buildHookOutput(text) {
  if (!text) return "";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `<membase-handoff>\n${neutralizeInjection(text)}\n</membase-handoff>`,
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
