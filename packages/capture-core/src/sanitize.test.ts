import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSecretAssignmentRe,
  clampRecallQuery,
  isCasualChat,
  redactSecrets,
  SECRET_ASSIGNMENT_KEYWORDS_BASIC,
  stripContextBlocks,
} from "./index";

interface VectorCase {
  in: string;
  out?: string;
  casual?: boolean;
}
interface VectorGroup {
  cases: VectorCase[];
  keywords?: string[];
}

const vectors: Record<string, VectorGroup> = JSON.parse(
  readFileSync(join(import.meta.dir, "../spec/sanitize-vectors.json"), "utf8"),
);

function group(name: string): VectorGroup {
  const g = vectors[name];
  if (!g) throw new Error(`missing vector group: ${name}`);
  return g;
}

describe("golden vectors", () => {
  test("redact_secret_assignment_full", () => {
    for (const c of group("redact_secret_assignment_full").cases) {
      expect(redactSecrets(c.in)).toBe(c.out as string);
    }
  });

  test("redact_secret_assignment_basic", () => {
    const re = buildSecretAssignmentRe(SECRET_ASSIGNMENT_KEYWORDS_BASIC);
    for (const c of group("redact_secret_assignment_basic").cases) {
      expect(c.in.replace(re, "$1=[REDACTED]")).toBe(c.out as string);
    }
  });

  test("redact_common_tokens", () => {
    for (const c of group("redact_common_tokens").cases) {
      expect(redactSecrets(c.in)).toBe(c.out as string);
    }
  });

  test("redact_bearer", () => {
    for (const c of group("redact_bearer").cases) {
      expect(redactSecrets(c.in)).toBe(c.out as string);
    }
  });

  test("strip_context_blocks", () => {
    for (const c of group("strip_context_blocks").cases) {
      expect(stripContextBlocks(c.in)).toBe(c.out as string);
    }
  });

  test("casual_chat", () => {
    const { cases, keywords } = group("casual_chat");
    for (const c of cases) {
      expect(isCasualChat(c.in, keywords ?? [])).toBe(c.casual as boolean);
    }
  });

  test("recall_query_clamp", () => {
    for (const c of group("recall_query_clamp").cases) {
      expect(clampRecallQuery(c.in)).toBe(c.out as string);
    }
  });
});
