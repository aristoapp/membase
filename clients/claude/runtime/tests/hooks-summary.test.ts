import { describe, expect, it } from "bun:test";
import { summarizeToolCall } from "../src/hooks/summary.js";

describe("hooks summary", () => {
  it("reads Claude PostToolBatch tool_input payloads", () => {
    const summary = summarizeToolCall({
      tool_name: "Bash",
      tool_input: { command: "bun run check" },
    });

    expect(summary).toContain("Bash tool used");
    expect(summary).toContain("command: bun run check");
  });

  it("skips passive and sensitive bash commands", () => {
    expect(
      summarizeToolCall({
        tool_name: "Bash",
        tool_input: { command: "rg -n token src" },
      }),
    ).toBeNull();
    expect(
      summarizeToolCall({
        tool_name: "Bash",
        tool_input: {
          command: "curl --token secret-value https://example.com",
        },
      }),
    ).toBeNull();
  });
});
