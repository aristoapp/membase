import { describe, expect, it } from "bun:test";
import {
  detectClientSource,
  normalizeCursorInput,
} from "../src/hooks/detect.js";

describe("host detection for the shared hooks file", () => {
  it("explicit MEMBASE_CLIENT_SOURCE always wins (returns undefined = leave as-is)", () => {
    expect(
      detectClientSource({ conversation_id: "c1" }, {
        MEMBASE_CLIENT_SOURCE: "hermes",
      } as NodeJS.ProcessEnv),
    ).toBeUndefined();
  });

  it("cursor is recognized by documented payload fields", () => {
    expect(detectClientSource({ conversation_id: "c1" }, {})).toBe("cursor");
    expect(detectClientSource({ workspace_roots: ["/w"] }, {})).toBe("cursor");
    expect(detectClientSource({ cursor_version: "1.0" }, {})).toBe("cursor");
  });

  it("codex is recognized by PLUGIN_ROOT (host-native) or CODEX_PLUGIN_ROOT (plugins-CLI channel)", () => {
    expect(
      detectClientSource({}, { PLUGIN_ROOT: "/p" } as NodeJS.ProcessEnv),
    ).toBe("codex");
    expect(
      detectClientSource({}, { CODEX_PLUGIN_ROOT: "/p" } as NodeJS.ProcessEnv),
    ).toBe("codex");
  });

  it("CLAUDE_PLUGIN_ROOT alone means Claude (codex's compat alias collides, so it is not a codex signal)", () => {
    expect(
      detectClientSource({}, { CLAUDE_PLUGIN_ROOT: "/p" } as NodeJS.ProcessEnv),
    ).toBeUndefined();
  });

  it("cursor payload fields beat env (a cursor session may carry plugin env)", () => {
    expect(
      detectClientSource({ conversation_id: "c1" }, {
        PLUGIN_ROOT: "/p",
      } as NodeJS.ProcessEnv),
    ).toBe("cursor");
  });

  it("normalizeCursorInput maps conversation_id/workspace_roots onto the shared shape", () => {
    const input = normalizeCursorInput({
      conversation_id: "c1",
      workspace_roots: ["/w1", "/w2"],
    });
    expect(input.session_id).toBe("c1");
    expect(input.cwd).toBe("/w1");
  });

  it("normalizeCursorInput never overwrites already-shared fields", () => {
    const input = normalizeCursorInput({
      session_id: "s1",
      cwd: "/real",
      conversation_id: "c1",
      workspace_roots: ["/w"],
    });
    expect(input.session_id).toBe("s1");
    expect(input.cwd).toBe("/real");
  });
});
