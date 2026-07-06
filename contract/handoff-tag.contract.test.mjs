// Contracts: C-HDF-1..2 (contract/spec.md "Handoff tag round-trip" section).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  CLAUDE_HOOK,
  makeDataDir,
  runEntry,
  startStubApi,
  writeConfig,
  writeCredentials,
} from "./helpers.mjs";

const TAG = "[HANDOFF]";

function treeContainsLiteral(root, literal) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
      const p = join(current, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        stack.push(p);
      } else if (st.isFile()) {
        try {
          if (readFileSync(p, "utf8").includes(literal)) return true;
        } catch {
          // binary or unreadable — not a tag carrier
        }
      }
    }
  }
  return false;
}

test("C-HDF-1 the literal [HANDOFF] tag appears identically across all four clients", () => {
  // Text-level check across the surfaces the spec names. The exact literal —
  // brackets, capitals, no space — must match everywhere, since recall
  // identifies a handoff "by that prefix alone".
  const surfaces = [
    ["claude runtime", join(REPO_ROOT, "clients/claude/runtime")],
    ["openclaw runtime", join(REPO_ROOT, "clients/openclaw/runtime")],
    ["cursor skill", join(REPO_ROOT, "clients/cursor/skills/handoff")],
    ["codex prompt", join(REPO_ROOT, "clients/codex/runtime/prompts")],
  ];
  for (const [label, root] of surfaces) {
    assert.ok(
      treeContainsLiteral(root, TAG),
      `${label} (${root}) does not contain the literal ${TAG}`,
    );
  }
});

test("C-HDF-2 SessionStart injects a [HANDOFF] bundle from the documented envelope", async (t) => {
  // Wire schema per spec: {"episodes": [{"episode": {name, summary,
  // valid_at, ...}}]}. Latest-vs-relevant stays server-delegated today
  // (KNOWN LIMIT in the spec) — this contract pins that a returned handoff
  // bundle IS injected, inside the single JSON stdout (C-HOOK-7).
  const bundle = {
    episode: {
      uuid: "u-handoff",
      name: "[HANDOFF] NEW-MARKER started the dashboard rewrite",
      summary: "[HANDOFF] NEW-MARKER started the dashboard rewrite",
      valid_at: "2026-07-05T00:00:00Z",
    },
  };
  const dir = await makeDataDir(t);
  const api = await startStubApi(t, {
    searchBody: { episodes: [bundle] },
  });
  await writeConfig(dir, { apiUrl: api.url });
  await writeCredentials(dir);
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  const searches = api.requests.filter((r) => r.url.includes("search"));
  assert.ok(
    searches.length >= 1,
    "session start with credentials must attempt a handoff recall",
  );
  // C-HOOK-7: the whole stdout must parse as ONE JSON document.
  const parsed = JSON.parse(run.stdout);
  const ctx = parsed.hookSpecificOutput?.additionalContext ?? "";
  assert.ok(
    ctx.includes("NEW-MARKER"),
    `handoff must be injected; context was: ${ctx.slice(0, 400)}`,
  );
});
