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

  it("rejects a sensitive Edit path so it never reaches scratch on disk", () => {
    expect(
      extractToolObservation({
        tool_name: "Edit",
        tool_input: { file_path: "apps/web/.env" },
      }),
    ).toBeNull();
    expect(
      extractToolObservation({
        tool_name: "Write",
        tool_input: { file_path: "config/.env.local" },
      }),
    ).toBeNull();
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

  it("extracts embedded exec_command cmds from Codex Desktop exec source", () => {
    const source = [
      'const r = await tools.exec_command({"cmd":"pnpm run build","timeout":60});',
      'const s = await tools.exec_command({"cmd":"rg --files -g \\"*.md\\""});',
    ].join("\n");
    const obs = extractToolObservation({
      tool_name: "exec",
      tool_input: { input: source },
    });
    // The important build command is kept; the passive rg scan is filtered.
    expect(obs).toEqual({ files: [], commands: ["pnpm run build"], tasks: 0 });
  });

  it("accepts exec tool_input as a raw string and rejects sensitive sources", () => {
    const obs = extractToolObservation({
      tool_name: "exec",
      tool_input: 'await tools.exec_command({"cmd":"git commit -m x"});',
    });
    expect(obs).toEqual({ files: [], commands: ["git commit -m x"], tasks: 0 });
    expect(
      extractToolObservation({
        tool_name: "exec",
        tool_input:
          'await tools.exec_command({"cmd":"export OPENAI_API_KEY=dummy1234567890abc && pnpm build"});',
      }),
    ).toBeNull();
  });

  it("returns null for exec with only passive commands or no cmds", () => {
    expect(
      extractToolObservation({
        tool_name: "exec",
        tool_input: { input: 'await tools.exec_command({"cmd":"ls -la"});' },
      }),
    ).toBeNull();
    expect(
      extractToolObservation({
        tool_name: "exec",
        tool_input: { input: "const x = 1 + 1;" },
      }),
    ).toBeNull();
  });

  it("treats a plain exec command payload as one shell command (codex CLI shape)", () => {
    expect(
      extractToolObservation({
        tool_name: "exec",
        tool_input: { command: "pnpm --version" },
      }),
    ).toEqual({ files: [], commands: ["pnpm --version"], tasks: 0 });
    expect(
      extractToolObservation({
        tool_name: "exec",
        tool_input: { command: "ls -la" },
      }),
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
    expect(digest?.content).toContain("Edited: src/a.ts, src/b.ts");
    expect(digest?.content).toContain("Commands: git commit -m x");
    expect(digest?.content).toContain("Sub-agent tasks: 2");
    expect(digest?.content).toContain("2026-07-07");
    expect(digest?.content).toContain("project: membase");
    expect(digest?.display_summary).toContain("2 file(s)");
    expect(digest?.display_summary).toContain("1 command(s)");
    expect(digest?.display_summary).toContain("2 task(s)");
  });

  it("drops only the sensitive file, keeps the rest of the digest", () => {
    const digest = buildSessionDigest({
      observations: [
        obs({ files: ["apps/web/.env.example", "src/a.ts"] }),
        obs({ commands: ["curl --token secret-value https://x"] }),
        obs({ commands: ["pnpm build"] }),
      ],
      dateLabel: "2026-07-07",
    });
    // The .env file and the secret-bearing command are scrubbed per item, but
    // the unrelated work survives (a single .env used to nuke the whole digest).
    expect(digest).not.toBeNull();
    expect(digest?.content).toContain("src/a.ts");
    expect(digest?.content).not.toContain(".env");
    expect(digest?.content).toContain("pnpm build");
    expect(digest?.content).not.toContain("secret-value");
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
    expect(digest?.content).toContain("(+5 more)");
    expect(digest?.display_summary).toContain("25 file(s)");
  });

  it("attributes to the session's own client label when provided", () => {
    const digest = buildSessionDigest({
      observations: [obs({ files: ["a.ts"] })],
      dateLabel: "2026-07-07",
      clientLabel: "Codex",
    });
    // A swept Codex session digested by a Claude Code process still reads Codex.
    expect(digest?.content).toContain("Codex session digest");
    expect(digest?.display_summary).toContain("Codex session:");
  });
});
