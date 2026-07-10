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

test("C-HDF-1 the literal [HANDOFF] tag appears identically across all five clients", () => {
  // Text-level check across the surfaces the spec names. The exact literal —
  // brackets, capitals, no space — must match everywhere, since recall
  // identifies a handoff "by that prefix alone".
  const surfaces = [
    ["stdio runtime", join(REPO_ROOT, "packages/stdio-runtime/src")],
    ["openclaw runtime", join(REPO_ROOT, "clients/openclaw/runtime")],
    ["cursor skill", join(REPO_ROOT, "clients/cursor/skills/handoff")],
    ["codex prompt", join(REPO_ROOT, "clients/codex/prompts")],
    ["hermes provider", join(REPO_ROOT, "clients/hermes/python/src/membase_hermes")],
  ];
  for (const [label, root] of surfaces) {
    assert.ok(
      treeContainsLiteral(root, TAG),
      `${label} (${root}) does not contain the literal ${TAG}`,
    );
  }
});

test("C-HDF-2 SessionStart injects the LATEST [HANDOFF] bundle, not the most relevant", async (t) => {
  // Relevance-ranked response: OLD handoff first (top relevance), a
  // non-handoff distractor, then the NEWER handoff last. Latest-by-time
  // must win, inside a single-JSON stdout (C-HOOK-7).
  const bundles = [
    { episode: { uuid: "u-old", name: "[HANDOFF] OLD-MARKER finished migration groundwork", summary: "[HANDOFF] OLD-MARKER", valid_at: "2026-07-01T00:00:00Z" } },
    { episode: { uuid: "u-noise", name: "we decided to use postgres", summary: "ordinary memory", valid_at: "2026-07-06T00:00:00Z" } },
    { episode: { uuid: "u-new", name: "[HANDOFF] NEW-MARKER started dashboard rewrite", summary: "[HANDOFF] NEW-MARKER", valid_at: "2026-07-05T00:00:00Z" } },
  ];
  const dir = await makeDataDir(t);
  const api = await startStubApi(t, { searchBody: { episodes: bundles } });
  await writeConfig(dir, { apiUrl: api.url });
  await writeCredentials(dir);
  const run = await runEntry(CLAUDE_HOOK, ["SessionStart"], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
    env: { MEMBASE_DATA_DIR: dir },
  });
  assert.equal(run.code, 0);
  const parsed = JSON.parse(run.stdout); // C-HOOK-7: single document
  const ctx = parsed.hookSpecificOutput?.additionalContext ?? "";
  assert.ok(ctx.includes("NEW-MARKER"), `latest handoff must win; context: ${ctx.slice(0, 300)}`);
  assert.ok(!ctx.includes("OLD-MARKER"), "older, more-relevant handoff must not win");
  assert.ok(!ctx.includes("postgres"), "non-handoff bundles must be ignored");
});
