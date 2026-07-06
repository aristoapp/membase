// MEMBASE_CLIENT_SOURCE lets other stdio-bundled clients (Cursor/Codex,
// north-star pillar 1) run the same bundle with correct source attribution.
// constants.ts reads the env at module load, so the override is exercised in
// a subprocess; the unset case is asserted in-process.
import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { getDataDir } from "../src/config/index.js";
import { MEMORY_SOURCE, USER_AGENT } from "../src/constants.js";

const RUNTIME_DIR = join(import.meta.dir, "..");

function constantsWithEnv(env: Record<string, string>) {
  const result = spawnSync(
    "bun",
    [
      "-e",
      'const c = await import("./src/constants.ts"); console.log(JSON.stringify({ source: c.MEMORY_SOURCE, ua: c.USER_AGENT }));',
    ],
    { cwd: RUNTIME_DIR, env: { ...process.env, ...env }, encoding: "utf-8" },
  );
  return JSON.parse(result.stdout.trim()) as { source: string; ua: string };
}

describe("stdio bundle client parameterization", () => {
  it("defaults to Claude Code attribution when the env is unset", () => {
    expect(MEMORY_SOURCE).toBe("claude-code");
    expect(USER_AGENT).toStartWith("membase-claude-code/");
  });

  it("MEMBASE_CLIENT_SOURCE overrides source and user agent", () => {
    const codex = constantsWithEnv({ MEMBASE_CLIENT_SOURCE: "codex" });
    expect(codex.source).toBe("codex");
    expect(codex.ua).toStartWith("membase-codex/");
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
