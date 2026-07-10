import { describe, expect, it } from "bun:test";
import {
  isCasualChat,
  isOperationalMessage,
  looksSensitive,
  sanitizeMembaseText,
  sanitizeRecallQuery,
} from "../src/sanitize/index.js";

describe("sanitize", () => {
  it("removes private blocks and redacts secrets", () => {
    const privateKeyBlock = [
      `-----BEGIN ${"PRIVATE KEY"}-----`,
      "secret",
      `-----END ${"PRIVATE KEY"}-----`,
    ].join("\n");
    const text = sanitizeMembaseText(`
      hello
      <private>do not save this</private>
      API_KEY=sk-secret
      ${privateKeyBlock}
    `);
    expect(text).toContain("hello");
    expect(text).not.toContain("do not save this");
    expect(text).toContain("API_KEY=[REDACTED]");
    expect(text).toContain("[REDACTED_PRIVATE_KEY]");
  });

  it("redacts common token forms in shell commands and headers", () => {
    const commonToken = ["sk", "abcdefghijklmnopqrstuvwxyz"].join("-");
    const text = sanitizeMembaseText(
      `curl -H 'Authorization: Bearer ${commonToken}' --token secret-value`,
    );
    expect(text).toContain("Authorization: Bearer [REDACTED]");
    expect(text).toContain("--token [REDACTED]");
    expect(text).not.toContain("secret-value");
    expect(looksSensitive("Authorization: Bearer sk-one")).toBe(true);
    expect(looksSensitive("cmd --api-key sk-two")).toBe(true);
  });

  it("strips membase context from recall queries", () => {
    const query = sanitizeRecallQuery(`
      <membase-context>old memory</membase-context>
      Please remember my TypeScript preference.
      \`\`\`
      const secret = true
      \`\`\`
    `);
    expect(query).not.toContain("old memory");
    expect(query).not.toContain("const secret");
    expect(query).toContain("TypeScript");
  });

  it("detects casual and operational messages", () => {
    expect(isCasualChat("thanks")).toBe(true);
    expect(isCasualChat("what did we decide last time?")).toBe(false);
    expect(isOperationalMessage("heartbeat_ok")).toBe(true);
  });

  it("detects repeated secret checks without regexp state leaks", () => {
    expect(looksSensitive("API_KEY=sk-one")).toBe(true);
    expect(looksSensitive("TOKEN=sk-two")).toBe(true);
  });
});
