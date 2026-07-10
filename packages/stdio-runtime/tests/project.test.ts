import { describe, expect, it } from "bun:test";
import { normalizeProjectSlug } from "../src/project/index.js";

describe("project", () => {
  it("normalizes project slugs", () => {
    expect(normalizeProjectSlug(" My Project_123 ")).toBe("my-project-123");
    expect(normalizeProjectSlug("Membase Claude Plugin")).toBe(
      "membase-claude-plugin",
    );
  });
});
