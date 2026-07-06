import { describe, expect, test } from "bun:test";
import {
  buildHandoffMemory,
  HANDOFF_TAG,
  handoffRecallQuery,
  isHandoffMemory,
  sanitizeCaptureText,
  sanitizeMembaseText,
} from "./utils";

describe("sanitizeCaptureText", () => {
  test("redacts secret assignments on the capture path", () => {
    const out = sanitizeCaptureText("set OPENAI_API_KEY=sk-abc123 in the env");
    expect(out).not.toContain("sk-abc123");
    expect(out).toContain("[REDACTED]");
  });

  test("redacts provider token formats", () => {
    const out = sanitizeCaptureText(
      "my token is ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    );
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz1234567890");
    expect(out).toContain("[REDACTED_TOKEN]");
  });

  test("redacts bearer headers", () => {
    const out = sanitizeCaptureText(
      "curl -H 'Authorization: Bearer abc.def.ghi'",
    );
    expect(out).not.toContain("abc.def.ghi");
  });

  test("redacts private key blocks", () => {
    const out = sanitizeCaptureText(
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----",
    );
    expect(out).toBe("[REDACTED_PRIVATE_KEY]");
  });

  test("still strips OpenClaw noise like sanitizeMembaseText", () => {
    const raw = "[Mon 2026-03-23 15:19 GMT+9] deploy the api server";
    expect(sanitizeCaptureText(raw)).toBe(sanitizeMembaseText(raw));
  });

  test("keeps ordinary text unchanged", () => {
    const raw = "we decided to use postgres for the queue";
    expect(sanitizeCaptureText(raw)).toBe(raw);
  });
});

describe("handoff memory tagging", () => {
  test("tags stored handoff content with the literal marker and project scope", () => {
    const content = buildHandoffMemory({
      summary: "Shipped D1 slices, gate closed.",
      project: "membase-plugin-mcp",
    });

    expect(content.startsWith(HANDOFF_TAG)).toBe(true);
    expect(content).toContain("membase-plugin-mcp");
    expect(content).toContain("Shipped D1 slices, gate closed.");
  });

  test("omits the project scope when none is known", () => {
    const content = buildHandoffMemory({ summary: "No project context." });
    expect(content).toBe(`${HANDOFF_TAG} No project context.`);
  });

  test("recognizes handoff-tagged memories and rejects ordinary ones", () => {
    expect(isHandoffMemory(buildHandoffMemory({ summary: "state" }))).toBe(true);
    expect(isHandoffMemory("just a regular remembered fact")).toBe(false);
  });

  test("recall query carries the tag so it matches stored handoffs across clients", () => {
    expect(handoffRecallQuery()).toContain(HANDOFF_TAG);
  });
});
