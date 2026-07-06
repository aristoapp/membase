import { describe, expect, test } from "bun:test";
import {
  buildHandoffDisplaySummary,
  buildHandoffMemory,
  HANDOFF_TAG,
  handoffRecallQuery,
  isHandoffMemory,
  pickLatestHandoff,
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

  test("omits the project scope when it is whitespace-only, instead of tagging a blank scope", () => {
    const content = buildHandoffMemory({ summary: "state", project: "   " });
    expect(content).toBe(`${HANDOFF_TAG} state`);
  });

  test("recognizes handoff-tagged memories and rejects ordinary ones", () => {
    expect(isHandoffMemory(buildHandoffMemory({ summary: "state" }))).toBe(true);
    expect(isHandoffMemory("just a regular remembered fact")).toBe(false);
  });

  test("recall query carries the tag so it matches stored handoffs across clients", () => {
    expect(handoffRecallQuery()).toContain(HANDOFF_TAG);
  });

  test("display_summary starts with the tag so the derived episode name is recallable", () => {
    // The backend uses display_summary as the episode name, which is the field
    // recall's isHandoffMemory check reads — the tag must be at the very start.
    const ds = buildHandoffDisplaySummary({
      summary: "Shipped D1 slices, gate closed.",
      project: "membase-plugin-mcp",
    });
    expect(ds.startsWith(HANDOFF_TAG)).toBe(true);
    expect(isHandoffMemory(ds)).toBe(true);
  });

  test("display_summary clamps a very long summary but keeps the tag", () => {
    const ds = buildHandoffDisplaySummary({ summary: "x".repeat(1000) });
    expect(ds.startsWith(HANDOFF_TAG)).toBe(true);
    expect(ds.length).toBeLessThanOrEqual(500);
  });
});

describe("pickLatestHandoff", () => {
  const bundle = (name: string, validAt: string | null, summary = "") => ({
    episode: { name, summary, valid_at: validAt, created_at: validAt },
  });

  test("returns the newest handoff, not the first (relevance) one", () => {
    const older = bundle(`${HANDOFF_TAG} older`, "2026-07-01T00:00:00Z");
    const newer = bundle(`${HANDOFF_TAG} newer`, "2026-07-05T00:00:00Z");
    // Relevance order puts the older one first; recency must still win.
    expect(pickLatestHandoff([older, newer])?.episode.name).toContain("newer");
  });

  test("ignores non-handoff bundles that leaked into the results", () => {
    const noise = bundle("Handoff: not really tagged", "2026-07-09T00:00:00Z");
    const real = bundle(`${HANDOFF_TAG} real`, "2026-07-02T00:00:00Z");
    expect(pickLatestHandoff([noise, real])?.episode.name).toContain("real");
  });

  test("matches the tag on episode.summary when the name lacks it", () => {
    const b = bundle("Some title", "2026-07-03T00:00:00Z", `${HANDOFF_TAG} body`);
    expect(pickLatestHandoff([b])).toBe(b);
  });

  test("returns undefined when no bundle is tagged", () => {
    expect(pickLatestHandoff([bundle("nope", "2026-07-01T00:00:00Z")])).toBe(
      undefined,
    );
  });

  test("prefers a timestamped handoff over an untimed one, regardless of order", () => {
    const untimed = bundle(`${HANDOFF_TAG} untimed`, null);
    const timed = bundle(`${HANDOFF_TAG} timed`, "2026-07-01T00:00:00Z");
    expect(pickLatestHandoff([untimed, timed])?.episode.name).toContain("timed");
    expect(pickLatestHandoff([timed, untimed])?.episode.name).toContain("timed");
  });
});
