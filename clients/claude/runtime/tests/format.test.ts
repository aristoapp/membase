import { describe, expect, it } from "bun:test";
import {
  buildRecallContext,
  formatMemorySearchResults,
} from "../src/format/index.js";
import type { EpisodeBundle } from "../src/types.js";

function memory(uuid: string, name: string): EpisodeBundle {
  return {
    episode: {
      uuid,
      name,
      summary: `${name} summary`,
      source: "claude-code",
      created_at: "2026-05-05T00:00:00Z",
    },
    relevance_score: 0.9,
    edges: [{ uuid: `${uuid}-edge`, fact: `${name} fact` }],
  };
}

describe("memory formatting", () => {
  it("shows pagination guidance when search results hit the limit", () => {
    const output = formatMemorySearchResults([memory("one", "One")], {
      limit: 1,
      offset: 10,
      hasMore: true,
    });

    expect(output).toContain("limit reached");
    expect(output).toContain("offset=11");
    expect(output).toContain("search with a different query");
  });

  it("labels project and broader auto-recall groups separately", () => {
    const context = buildRecallContext(
      [
        {
          title: "Project memories (project=aristoapp-claude-membase)",
          memories: [memory("project", "Project decision")],
        },
        {
          title: "Broader memories (unscoped search)",
          memories: [memory("global", "Global preference")],
          capped: true,
        },
      ],
      [],
      4000,
    );

    expect(context).toContain(
      "Project memories (project=aristoapp-claude-membase)",
    );
    expect(context).toContain("Broader memories (unscoped search)");
    expect(context).toContain("prefetch limit reached");
    expect(context).toContain("Use search_memory for deeper recall");
  });
});
