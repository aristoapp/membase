// MEMBASE_CLIENT_SOURCE lets other stdio-bundled clients (Cursor/Codex)
// run the same bundle with correct source attribution.
// constants.ts reads the env at module load, so every case runs in a
// subprocess with the env var explicitly set or deleted.
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../src/config/index.js";

const RUNTIME_DIR = join(import.meta.dir, "..");

function constantsWithEnv(env: Record<string, string | undefined>) {
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    ...env,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
  }
  const result = spawnSync(
    "bun",
    [
      "-e",
      'const c = await import("./src/constants.ts"); console.log(JSON.stringify({ source: c.MEMORY_SOURCE, ua: c.USER_AGENT, plugin: c.INGEST_PLUGIN_LABEL }));',
    ],
    { cwd: RUNTIME_DIR, env: childEnv, encoding: "utf-8" },
  );
  return JSON.parse(result.stdout.trim()) as {
    source: string;
    ua: string;
    plugin: string;
  };
}

describe("stdio bundle client parameterization", () => {
  it("defaults to Claude Code attribution when the env is unset", () => {
    const unset = constantsWithEnv({ MEMBASE_CLIENT_SOURCE: undefined });
    expect(unset.source).toBe("claude-code");
    expect(unset.ua).toStartWith("membase-claude-code/");
    expect(unset.plugin).toBe("claude-membase");
  });

  it("MEMBASE_CLIENT_SOURCE overrides source and user agent", () => {
    const codex = constantsWithEnv({ MEMBASE_CLIENT_SOURCE: "codex" });
    expect(codex.source).toBe("codex");
    expect(codex.ua).toStartWith("membase-codex/");
    expect(codex.plugin).toBe("membase-bundle-codex");
  });

  it("falls back to claude-code when the source fails validation", () => {
    // Values outside [a-z0-9-]{1,32} would poison the User-Agent header.
    const bad = constantsWithEnv({ MEMBASE_CLIENT_SOURCE: "evil\nsource" });
    expect(bad.source).toBe("claude-code");
    expect(bad.ua).toStartWith("membase-claude-code/");
  });

  it("defaults the data dir per client descriptor when no env is set", () => {
    const dataDirWithEnv = (env: Record<string, string | undefined>) => {
      const childEnv: Record<string, string | undefined> = {
        ...process.env,
        MEMBASE_DATA_DIR: undefined,
        CLAUDE_PLUGIN_DATA: undefined,
        ...env,
      };
      for (const [key, value] of Object.entries(childEnv)) {
        if (value === undefined) delete childEnv[key];
      }
      const result = spawnSync(
        "bun",
        [
          "-e",
          'const c = await import("./src/config/index.ts"); console.log(c.getDataDir());',
        ],
        { cwd: RUNTIME_DIR, env: childEnv, encoding: "utf-8" },
      );
      return result.stdout.trim();
    };
    // Claude keeps its pre-neutral-layout dir (installed-plugin contract).
    expect(dataDirWithEnv({ MEMBASE_CLIENT_SOURCE: undefined })).toEndWith(
      join(".claude", "plugins", "membase"),
    );
    // Every other client is per-source under ~/.membase without needing
    // MEMBASE_DATA_DIR in its hook command.
    expect(dataDirWithEnv({ MEMBASE_CLIENT_SOURCE: "cursor" })).toEndWith(
      join(".membase", "cursor"),
    );
  });

  it("MEMBASE_DATA_DIR wins over the Claude-specific data dir env", () => {
    const prevNeutral = process.env.MEMBASE_DATA_DIR;
    const prevClaude = process.env.CLAUDE_PLUGIN_DATA;
    process.env.MEMBASE_DATA_DIR = "/tmp/neutral-dir";
    process.env.CLAUDE_PLUGIN_DATA = "/tmp/claude-dir";
    try {
      expect(getDataDir()).toBe("/tmp/neutral-dir");
    } finally {
      if (prevNeutral === undefined) delete process.env.MEMBASE_DATA_DIR;
      else process.env.MEMBASE_DATA_DIR = prevNeutral;
      if (prevClaude === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
      else process.env.CLAUDE_PLUGIN_DATA = prevClaude;
    }
  });
});
