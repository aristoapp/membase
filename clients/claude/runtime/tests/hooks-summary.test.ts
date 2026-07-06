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

describe("codex payload support", () => {
  it("summarizes apply_patch with the touched files", () => {
    const summary = summarizeToolCall({
      tool_name: "apply_patch",
      tool_input: {
        command:
          "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-1\n+2\n*** Add File: src/b.ts\n+hi\n*** End Patch",
      },
    });
    expect(summary).toContain("apply_patch tool used");
    expect(summary).toContain("files: src/a.ts, src/b.ts");
  });

  it("drops apply_patch payloads that look sensitive", () => {
    expect(
      summarizeToolCall({
        tool_name: "apply_patch",
        tool_input: {
          command:
            "*** Update File: .env\n+OPENAI_API_KEY=dummy1234567890abc",
        },
      }),
    ).toBeNull();
  });
});
