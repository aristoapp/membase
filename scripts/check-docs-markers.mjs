#!/usr/bin/env node
// Guard: doc-truth tripwires. The docs surface has no compiler, so stale
// path/name claims rot silently (batch review 2026-07-10 found eight of
// them). Each marker below pins one fixed doc-vs-code truth as a literal
// substring — a tripwire, not a doc linter; extend only when a new divergence
// class is fixed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// [file, mustContain[], mustNotContain[]]
const specs = [
  [
    "docs/security.md",
    ["hooks/mcp-server.cjs", "~/.openclaw/credentials/openclaw-membase.json"],
    ["scripts/mcp-server.cjs"],
  ],
  ["clients/codex/README.md", [".plugin/plugin.json"], []],
  ["clients/hermes/python/README.md", [], ["0.0.0"]],
  ["CONTRIBUTING.md", [], ["deleteOrForget"]],
];

const failures = [];

for (const [file, mustContain, mustNotContain] of specs) {
  let content;
  try {
    content = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");
  } catch (error) {
    failures.push(`${file}: unable to read (${error.message})`);
    continue;
  }
  for (const marker of mustContain) {
    if (!content.includes(marker)) {
      failures.push(`${file}: missing marker ${JSON.stringify(marker)}`);
    }
  }
  for (const marker of mustNotContain) {
    if (content.includes(marker)) {
      failures.push(`${file}: stale marker ${JSON.stringify(marker)} reappeared`);
    }
  }
}

if (failures.length > 0) {
  console.error("Docs marker check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Docs marker check passed (${specs.length} files).`);
