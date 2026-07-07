// Contract: C-DRM-1 (contract/spec.md "Dream flush protocol" section).
// Doc-level, string-level checks on the four dream documents — these
// markdown files are docs, not implementation, and the spec names them as
// the contract surface.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

const DREAM_DOCS = [
  ["claude command", "clients/claude/runtime/plugin/commands/dream.md"],
  ["claude skill", "clients/claude/runtime/plugin/skills/dream/SKILL.md"],
  ["cursor skill", "clients/cursor/skills/dream/SKILL.md"],
  ["codex prompt", "clients/codex/runtime/prompts/dream.md"],
];

// The four protocol clauses, as text-detectable requirements.
const CLAUSES = [
  ["names the spool file", /pending\.jsonl/],
  ["renames before uploading", /rename/i],
  [
    "never uploads secret-looking records",
    /secret/i,
  ],
  [
    "never deletes skipped-secret records / deletes only after all stored",
    /(do not delete|don't delete|never delete|only after|after all)/i,
  ],
];

test("C-DRM-1 all four dream docs specify the same flush protocol semantics", () => {
  const texts = DREAM_DOCS.map(([label, rel]) => {
    const path = join(REPO_ROOT, rel);
    let text;
    assert.doesNotThrow(() => {
      text = readFileSync(path, "utf8");
    }, `${label} missing at ${path}`);
    return [label, text];
  });

  for (const [label, text] of texts) {
    for (const [clause, re] of CLAUSES) {
      assert.match(
        text,
        re,
        `${label} does not state the protocol clause: ${clause}`,
      );
    }
  }
});

test("C-DRM-1 the shared protocol sentences literally agree across all four docs", () => {
  // "string-level check on the shared sentences": the rename target pattern
  // and the secret-handling directive must be the same literal convention in
  // every doc, not four paraphrases with drift.
  // Markdown hard-wraps lines; collapse whitespace so sentence checks match
  // the prose, not the wrapping.
  const texts = DREAM_DOCS.map(([label, rel]) => [
    label,
    readFileSync(join(REPO_ROOT, rel), "utf8").replace(/\s+/g, " "),
  ]);
  // Every doc must agree on renaming pending.jsonl to a flush-* batch file.
  for (const [label, text] of texts) {
    assert.match(
      text,
      /flush-/,
      `${label} does not name the flush-* rename target — protocol drift`,
    );
    assert.match(
      text,
      /(do not|don't|never)[^.]{0,80}upload/i,
      `${label} lacks the do-not-upload-secrets directive`,
    );
  }
});
