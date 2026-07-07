import { describe, expect, test } from "bun:test";
import {
  HANDOFF_REPLACE_LIMIT,
  sweepReplacedHandoffs,
  buildHandoffDisplaySummary,
  isHandoffMemory,
  pickLatestHandoff,
  selectReplaceableHandoffs,
} from "./index";

function bundle(name: string, valid_at?: string) {
  return { episode: { uuid: `u-${name}`, name, valid_at } };
}

describe("handoff helpers", () => {
  test("pickLatestHandoff prefers time over relevance order", () => {
    const picked = pickLatestHandoff([
      bundle("[HANDOFF] old", "2026-07-01T00:00:00Z"),
      bundle("ordinary memory", "2026-07-06T00:00:00Z"),
      bundle("[HANDOFF] new", "2026-07-05T00:00:00Z"),
    ]);
    expect(picked?.episode.name).toBe("[HANDOFF] new");
  });

  test("selectReplaceableHandoffs keeps only NAME-tagged bundles, capped", () => {
    const noise = bundle("we chose postgres");
    const summaryOnly = {
      episode: { uuid: "u-sum", name: "derived title", summary: "[HANDOFF] via summary" },
    };
    const tagged = Array.from({ length: HANDOFF_REPLACE_LIMIT + 3 }, (_, i) =>
      bundle(`[HANDOFF] state ${i}`),
    );
    const selected = selectReplaceableHandoffs([noise, summaryOnly, ...tagged], {
      projectScoped: true,
    });
    expect(selected).toHaveLength(HANDOFF_REPLACE_LIMIT);
    expect(selected.every((b) => isHandoffMemory(b.episode.name))).toBe(true);
  });

  test("unscoped selection excludes project-scoped handoffs", () => {
    const selected = selectReplaceableHandoffs(
      [bundle("[HANDOFF] (proj-a) scoped state"), bundle("[HANDOFF] unscoped state")],
      { projectScoped: false },
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.episode.name).toBe("[HANDOFF] unscoped state");
  });

  test("sweepReplacedHandoffs deletes in parallel and counts failures out", async () => {
    const deleted: string[] = [];
    const replaced = await sweepReplacedHandoffs(
      [bundle("[HANDOFF] one"), bundle("[HANDOFF] two"), bundle("noise")],
      async (uuid) => {
        if (uuid.includes("two")) throw new Error("403");
        deleted.push(uuid);
      },
      { projectScoped: true },
    );
    expect(replaced).toBe(1);
    expect(deleted).toHaveLength(1);
  });

  test("display summary clamps long input but keeps the tag first", () => {
    const out = buildHandoffDisplaySummary({
      summary: "x".repeat(1000),
      project: "proj",
    });
    expect(out.startsWith("[HANDOFF] (proj)")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(500);
  });
});
