import { describe, expect, it } from "bun:test";
import {
  buildSessionStartContext,
  sessionStartRoutingGuide,
} from "../src/hooks/session-start.js";

const profile = {
  email: "user@example.com",
  display_name: "Ada",
  role: "Founder",
  interests: "AI agents",
  instructions: "Prefer concise answers",
  timezone: "UTC",
};

describe("SessionStart context", () => {
  it("uses minimal context by default without injecting recent memories", () => {
    const context = buildSessionStartContext({
      mode: "minimal",
      projectSlug: "aristoapp-claude-membase",
      profile,
    });

    expect(context).toContain("project_slug: aristoapp-claude-membase");
    expect(context).toContain("account:");
    expect(context).toContain("search_memory");
    expect(context).toContain("membase://profile");
    expect(context).toContain("membase://recent");
    expect(context).toContain("untrusted reference data");
    expect(context).not.toContain("recent:");
    expect(context).not.toContain("Prefer concise answers");
  });

  it("can include full profile settings when explicitly configured", () => {
    const context = buildSessionStartContext({
      mode: "profile",
      projectSlug: "aristoapp-claude-membase",
      profile,
    });

    expect(context).toContain("profile:");
    expect(context).toContain("Prefer concise answers");
    const profileLine = context
      .split("\n")
      .find((line) => line.startsWith("profile:"));
    expect(profileLine).not.toContain("user@example.com");
  });

  it("can disable SessionStart context while preserving hook execution", () => {
    expect(buildSessionStartContext({ mode: "off", profile })).toBe("");
  });

  it("separates stable profile settings from remembered history", () => {
    const guide = sessionStartRoutingGuide();

    expect(guide).toContain("stable user settings");
    expect(guide).toContain("remembered history");
    expect(guide).toContain("latest, recent, or what changed");
  });
});
