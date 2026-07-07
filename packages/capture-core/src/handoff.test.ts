import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HANDOFF_REPLACE_LIMIT,
  sweepReplacedHandoffs,
  buildHandoffDisplaySummary,
  buildHandoffMemory,
  handoffRecallQuery,
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

// Golden vectors shared with the Hermes Python port (ADR 0002) — see
// clients/hermes/python/tests/test_handoff_vectors.py for the other consumer.
interface EpisodeFields {
  name?: string;
  summary?: string;
  valid_at?: string;
  created_at?: string;
}
const handoffVectors = JSON.parse(
  readFileSync(join(import.meta.dir, "../spec/handoff-vectors.json"), "utf8"),
);

function vectorBundles(eps: EpisodeFields[]) {
  return eps.map((ep, i) => ({ episode: { uuid: `u-${i}`, ...ep } }));
}

describe("handoff golden vectors", () => {
  test("recall_query", () => {
    expect(handoffRecallQuery()).toBe(handoffVectors.recall_query.out);
  });

  test("handoff_memory", () => {
    for (const c of handoffVectors.handoff_memory.cases) {
      expect(buildHandoffMemory({ summary: c.summary, project: c.project })).toBe(c.out);
    }
  });

  test("handoff_display_summary", () => {
    for (const c of handoffVectors.handoff_display_summary.cases) {
      expect(
        buildHandoffDisplaySummary({ summary: c.summary, project: c.project }),
      ).toBe(c.out);
    }
  });

  test("is_handoff_memory", () => {
    for (const c of handoffVectors.is_handoff_memory.cases) {
      expect(isHandoffMemory(c.in)).toBe(c.is_handoff);
    }
  });

  test("pick_latest_handoff", () => {
    for (const c of handoffVectors.pick_latest_handoff.cases) {
      const bundles = vectorBundles(c.bundles);
      const picked = pickLatestHandoff(bundles);
      if (c.picked_index === null) {
        expect(picked).toBeUndefined();
      } else {
        expect(picked).toBe(bundles[c.picked_index]);
      }
    }
  });

  test("select_replaceable_handoffs", () => {
    for (const c of handoffVectors.select_replaceable_handoffs.cases) {
      const bundles = vectorBundles(c.bundles);
      const selected = selectReplaceableHandoffs(bundles, {
        projectScoped: c.project_scoped,
      });
      expect(selected.map((b) => bundles.indexOf(b))).toEqual(c.selected_indexes);
    }
  });
});
