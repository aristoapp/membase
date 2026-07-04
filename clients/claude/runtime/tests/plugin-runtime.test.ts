import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const pluginRoot = join(repoRoot, "plugin");

describe("Claude plugin runtime wiring", () => {
  it("lets Claude load the default hooks file only once", () => {
    const manifest = JSON.parse(
      readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf-8"),
    ) as Record<string, unknown>;

    expect(manifest.hooks).toBeUndefined();
  });

  it("does not route slash commands through a bare membase CLI", () => {
    const commandsDir = join(pluginRoot, "commands");
    const commandFiles = readdirSync(commandsDir).filter((file) =>
      file.endsWith(".md"),
    );

    for (const file of commandFiles) {
      const body = readFileSync(join(commandsDir, file), "utf-8");
      expect(body).not.toMatch(
        /\bmembase\s+(login|logout|status|recall|remember|wiki|index-project|project-config)\b/,
      );
    }
  });

  it("warns about stale session context during account switches", () => {
    const login = readFileSync(
      join(pluginRoot, "commands", "login.md"),
      "utf-8",
    );
    const logout = readFileSync(
      join(pluginRoot, "commands", "logout.md"),
      "utf-8",
    );

    expect(login).toContain("stale_session_context_warning");
    expect(login).toContain("/clear");
    expect(logout).toContain("stale_session_context_warning");
    expect(logout).toContain("/clear");
  });

  it("exposes a configurable SessionStart context mode", () => {
    const manifest = JSON.parse(
      readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf-8"),
    ) as {
      userConfig?: Record<string, { default?: unknown; description?: string }>;
    };

    expect(manifest.userConfig?.sessionStartContext?.default).toBe("minimal");
    expect(manifest.userConfig?.sessionStartContext?.description).toContain(
      "off, minimal, or profile",
    );
  });
});
