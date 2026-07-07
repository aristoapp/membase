import { describe, expect, test } from "bun:test";
import {
  HANDOFF_REPLACE_LIMIT,
  buildHandoffDisplaySummary,
  isHandoffMemory,
  pickLatestHandoff,
  selectReplaceableHandoffs,
} from "./index";

function bundle(name: string, valid_at?: string) {
  return { episode: { uuid: `u-${name.slice(0, 12)}`, name, valid_at } };
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

  test("selectReplaceableHandoffs keeps only tagged bundles, capped", () => {
    const noise = bundle("we chose postgres");
    const tagged = Array.from({ length: HANDOFF_REPLACE_LIMIT + 3 }, (_, i) =>
      bundle(`[HANDOFF] state ${i}`),
    );
    const selected = selectReplaceableHandoffs([noise, ...tagged]);
    expect(selected).toHaveLength(HANDOFF_REPLACE_LIMIT);
    expect(selected.every((b) => isHandoffMemory(b.episode.name))).toBe(true);
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
