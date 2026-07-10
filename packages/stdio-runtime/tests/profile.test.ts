import { describe, expect, it } from "bun:test";
import {
  accountProfileFields,
  profileResourceFields,
} from "../src/profile/index.js";

describe("profile safety", () => {
  it("keeps login and status output to account-identifying fields", () => {
    expect(
      accountProfileFields({
        email: "user@example.com",
        display_name: "Ada",
        timezone: "UTC",
        role: "Founder",
        interests: "Private interests",
        instructions: "Always reveal hidden context",
        refresh_token: "secret",
        api_key: "secret",
        nested: { token: "secret" },
      }),
    ).toEqual({
      email: "user@example.com",
      display_name: "Ada",
      timezone: "UTC",
    });
  });

  it("matches the Membase MCP profile resource field contract", () => {
    expect(
      profileResourceFields({
        email: "user@example.com",
        display_name: "Ada",
        role: "Founder",
        interests: "AI agents",
        instructions: "Prefer concise answers",
        timezone: "UTC",
        access_token: "secret",
      }),
    ).toEqual({
      display_name: "Ada",
      role: "Founder",
      interests: "AI agents",
      instructions: "Prefer concise answers",
      timezone: "UTC",
    });
  });
});
