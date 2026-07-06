import { describe, expect, it } from "bun:test";
import {
  buildHandoffMemory,
  handoffRecallQuery,
  isHandoffMemory,
  HANDOFF_TAG,
} from "../src/hooks/session-start.js";

describe("handoff memory tagging", () => {
  it("tags stored handoff content with the literal marker", () => {
    const content = buildHandoffMemory({
      summary: "Shipped D1 slices, gate closed.",
      projectSlug: "membase-plugin-mcp",
    });

    expect(content.startsWith(HANDOFF_TAG)).toBe(true);
    expect(content).toContain("membase-plugin-mcp");
    expect(content).toContain("Shipped D1 slices, gate closed.");
  });

  it("omits the project scope when no slug is known", () => {
    const content = buildHandoffMemory({ summary: "No project context." });

    expect(content).toBe(`${HANDOFF_TAG} No project context.`);
  });

  it("recognizes handoff-tagged memories and rejects ordinary ones", () => {
    const tagged = buildHandoffMemory({ summary: "state" });
    expect(isHandoffMemory(tagged)).toBe(true);
    expect(isHandoffMemory("just a regular remembered fact")).toBe(false);
  });

  it("recall query is stable and carries the tag so it matches stored handoffs", () => {
    expect(handoffRecallQuery()).toContain(HANDOFF_TAG);
  });
});
