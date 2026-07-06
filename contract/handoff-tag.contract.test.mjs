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

test("C-HDF-2 recall injects the LATEST handoff (by time), not the most relevant", async (t) => {
  // SPEC-AMBIGUITY: the spec promises "always exactly the latest one" but
  // does not define the recall wire protocol. Best independent reading: the
  // session-start recall path (the only credentialed entry point that could
  // fetch a handoff) must surface the newest handoff when the API offers
  // several. The stub answers any recall-ish request with two handoffs —
  // OLD first and with a higher relevance score, NEW second — under every
  // common envelope key, each item carrying content/text/summary/created_at.
  const oldItem = {
    id: "handoff-old",
    content: "[HANDOFF] OLD-MARKER finished the migration groundwork",
    text: "[HANDOFF] OLD-MARKER finished the migration groundwork",
    summary: "[HANDOFF] OLD-MARKER",
    created_at: "2026-07-01T00:00:00Z",
    score: 0.99,
  };
  const newItem = {
    id: "handoff-new",
    content: "[HANDOFF] NEW-MARKER started the dashboard rewrite",
    text: "[HANDOFF] NEW-MARKER started the dashboard rewrite",
    summary: "[HANDOFF] NEW-MARKER",
    created_at: "2026-07-05T00:00:00Z",
    score: 0.42,
  };
  const both = [oldItem, newItem];
  const dir = await makeDataDir(t);
  const api = await startStubApi(t, {
    searchBody: { results: both, memories: both, bundles: both, data: both },
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
  const ctx =
    JSON.parse(run.stdout || "{}").hookSpecificOutput?.additionalContext ?? "";
  assert.ok(
    ctx.includes("NEW-MARKER"),
    `latest handoff must be injected; context was: ${ctx.slice(0, 400)}`,
  );
  assert.ok(
    !ctx.includes("OLD-MARKER"),
    "older (more 'relevant') handoff must NOT win over the latest",
  );
});
