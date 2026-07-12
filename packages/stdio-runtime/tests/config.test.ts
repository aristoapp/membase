import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { getDataDir, loadConfig } from "../src/config/index.js";

function withTempConfig<T>(callback: () => T): T {
  const previousData = process.env.CLAUDE_PLUGIN_DATA;
  // MEMBASE_DATA_DIR outranks CLAUDE_PLUGIN_DATA in getDataDir, so an ambient
  // value would redirect every test away from the temp dir.
  const previousNeutral = process.env.MEMBASE_DATA_DIR;
  const previousContext = process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext;
  const dir = mkdtempSync(join(tmpdir(), "claude-membase-config-"));
  process.env.CLAUDE_PLUGIN_DATA = dir;
  delete process.env.MEMBASE_DATA_DIR;
  delete process.env.CLAUDE_PLUGIN_OPTION_sessionStartContext;
  try {
    return callback();
  } finally {
    if (previousData === undefined) {
      delete process.env.CLAUDE_PLUGIN_DATA;
    } else {
      process.env.CLAUDE_PLUGIN_DATA = previousData;
    }
    if (previousNeutral === undefined) {
      delete process.env.MEMBASE_DATA_DIR;
    } else {
      process.env.MEMBASE_DATA_DIR = previousNeutral;
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
  function withCaptureModeOption<T>(value: string, callback: () => T): T {
    const prev = process.env.CLAUDE_PLUGIN_OPTION_captureMode;
    process.env.CLAUDE_PLUGIN_OPTION_captureMode = value;
    try {
      return callback();
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PLUGIN_OPTION_captureMode;
      else process.env.CLAUDE_PLUGIN_OPTION_captureMode = prev;
    }
  }

  it("summary capture is the default with no config, env, or option", () => {
    // The claude-code descriptor carries defaultCaptureMode: "summary"
    // (2026-07-12 decision: off-by-default meant off-forever in practice).
    withTempConfig(() => {
      expect(loadConfig().captureMode).toBe("summary");
    });
  });

  it("CLAUDE_PLUGIN_OPTION_captureMode=summary enables capture without a config file", () => {
    withTempConfig(() => {
      withCaptureModeOption("summary", () => {
        expect(loadConfig().captureMode).toBe("summary");
      });
    });
  });

  it("an explicit disk captureMode wins over the hook-env default", () => {
    withTempConfig(() => {
      writeFileSync(
        join(getDataDir(), "config.json"),
        JSON.stringify({ captureMode: "off" }),
      );
      withCaptureModeOption("summary", () => {
        expect(loadConfig().captureMode).toBe("off");
      });
    });
  });

  it("MEMBASE_CAPTURE_MODE=summary enables capture and outranks the Claude option name", () => {
    withTempConfig(() => {
      const prev = process.env.MEMBASE_CAPTURE_MODE;
      process.env.MEMBASE_CAPTURE_MODE = "summary";
      try {
        expect(loadConfig().captureMode).toBe("summary");
        // Neutral env wins over the legacy Claude-branded name.
        withCaptureModeOption("off", () => {
          expect(loadConfig().captureMode).toBe("summary");
        });
      } finally {
        if (prev === undefined) delete process.env.MEMBASE_CAPTURE_MODE;
        else process.env.MEMBASE_CAPTURE_MODE = prev;
      }
    });
  });
});

describe("getDataDir", () => {
  it("expands a leading ~/ in the env override", () => {
    withTempConfig(() => {
      process.env.CLAUDE_PLUGIN_DATA = "~/.claude/plugins/membase-test";
      expect(getDataDir()).toBe(
        join(homedir(), ".claude", "plugins", "membase-test"),
      );
    });
  });
});
