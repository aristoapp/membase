import { describe, expect, it } from "bun:test";
import { extractToolObservation } from "../src/hooks/summary.js";
import { buildSessionDigest } from "../src/hooks/digest.js";
import type { ToolObservation } from "../src/hooks/summary.js";

describe("extractToolObservation", () => {
  it("reads a meaningful Bash command", () => {
    const obs = extractToolObservation({
      tool_name: "Bash",
      tool_input: { command: "bun run check" },
    });
    expect(obs).toEqual({ files: [], commands: ["bun run check"], tasks: 0 });
  });

  it("skips passive and sensitive bash commands", () => {
    expect(
      extractToolObservation({
        tool_name: "Bash",
        tool_input: { command: "rg -n token src" },
      }),
    ).toBeNull();
    expect(
      extractToolObservation({
        tool_name: "Bash",
        tool_input: {
          command: "curl --token secret-value https://example.com",
        },
      }),
    ).toBeNull();
  });

  it("reads an Edit file path", () => {
    const obs = extractToolObservation({
      tool_name: "Edit",
      tool_input: { file_path: "src/a.ts" },
    });
    expect(obs).toEqual({ files: ["src/a.ts"], commands: [], tasks: 0 });
  });

  it("counts a sub-agent Task", () => {
    const obs = extractToolObservation({ tool_name: "Task", tool_input: {} });
    expect(obs).toEqual({ files: [], commands: [], tasks: 1 });
  });

  it("summarizes apply_patch with the touched files", () => {
    const obs = extractToolObservation({
      tool_name: "apply_patch",
      tool_input: {
        command:
          "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-1\n+2\n*** Add File: src/b.ts\n+hi\n*** End Patch",
      },
    });
    expect(obs).toEqual({
      files: ["src/a.ts", "src/b.ts"],
      commands: [],
      tasks: 0,
    });
  });

  it("drops apply_patch payloads that look sensitive", () => {
    expect(
      extractToolObservation({
        tool_name: "apply_patch",
        tool_input: {
          command: "*** Update File: .env\n+OPENAI_API_KEY=dummy1234567890abc",
        },
      }),
    ).toBeNull();
  });

  it("ignores non-allowed tools", () => {
    expect(
      extractToolObservation({ tool_name: "Read", tool_input: {} }),
    ).toBeNull();
  });
});

describe("buildSessionDigest", () => {
  const obs = (o: Partial<ToolObservation>): ToolObservation => ({
    files: [],
    commands: [],
    tasks: 0,
    ...o,
  });

  it("folds observations into one digest, deduping files/commands", () => {
    const digest = buildSessionDigest({
      observations: [
        obs({ files: ["src/a.ts"] }),
        obs({ files: ["src/a.ts", "src/b.ts"] }),
        obs({ commands: ["git commit -m x"] }),
        obs({ commands: ["git commit -m x"] }),
        obs({ tasks: 1 }),
        obs({ tasks: 1 }),
      ],
      project: "membase",
      dateLabel: "2026-07-07",
    });
    expect(digest).not.toBeNull();
    expect(digest?.fileCount).toBe(2);
    expect(digest?.commandCount).toBe(1);
    expect(digest?.taskCount).toBe(2);
    expect(digest?.content).toContain("Edited: src/a.ts, src/b.ts");
    expect(digest?.content).toContain("Commands: git commit -m x");
    expect(digest?.content).toContain("Sub-agent tasks: 2");
    expect(digest?.content).toContain("2026-07-07");
    expect(digest?.content).toContain("project: membase");
  });

  it("returns null for a session with no meaningful observations", () => {
    expect(
      buildSessionDigest({ observations: [], dateLabel: "2026-07-07" }),
    ).toBeNull();
    expect(
      buildSessionDigest({
        observations: [obs({})],
        dateLabel: "2026-07-07",
      }),
    ).toBeNull();
  });

  it("caps files and notes the overflow count", () => {
    const files = Array.from({ length: 25 }, (_, i) => `f${i}.ts`);
    const digest = buildSessionDigest({
      observations: files.map((f) => obs({ files: [f] })),
      dateLabel: "2026-07-07",
    });
    expect(digest?.fileCount).toBe(25);
    expect(digest?.content).toContain("(+5 more)");
  });
});
