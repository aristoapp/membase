import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/index.js";

function withTempConfig<T>(callback: () => T): T {
  const previousData = process.env.CLAUDE_PLUGIN_DATA;
  const previousContext = process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext;
  const dir = mkdtempSync(join(tmpdir(), "claude-membase-config-"));
  process.env.CLAUDE_PLUGIN_DATA = dir;
  delete process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext;
  try {
    return callback();
  } finally {
    if (previousData === undefined) {
      delete process.env.CLAUDE_PLUGIN_DATA;
    } else {
      process.env.CLAUDE_PLUGIN_DATA = previousData;
    }
    if (previousContext === undefined) {
      delete process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext;
    } else {
      process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext = previousContext;
    }
    rmSync(dir, { force: true, recursive: true });
  }
}

describe("config", () => {
  it("defaults SessionStart context to minimal", () => {
    withTempConfig(() => {
      expect(loadConfig().sessionStartContext).toBe("minimal");
    });
  });

  it("accepts supported SessionStart context modes from plugin options", () => {
    withTempConfig(() => {
      process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext = "profile";
      expect(loadConfig().sessionStartContext).toBe("profile");

      process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext = "off";
      expect(loadConfig().sessionStartContext).toBe("off");
    });
  });

  it("falls back to minimal for unknown SessionStart context modes", () => {
    withTempConfig(() => {
      process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext = "recent";
      expect(loadConfig().sessionStartContext).toBe("minimal");
    });
  });
});

describe("captureMode plugin option", () => {
  it("CLAUDE_PLUGIN_OPTION_captureMode=summary enables capture without a config file", () => {
    withTempConfig(() => {
      const prev = process.env.CLAUDE_PLUGIN_OPTION_captureMode;
      process.env.CLAUDE_PLUGIN_OPTION_captureMode = "summary";
      try {
        expect(loadConfig().captureMode).toBe("summary");
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_OPTION_captureMode;
        else process.env.CLAUDE_PLUGIN_OPTION_captureMode = prev;
      }
    });
  });
});
