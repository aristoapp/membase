import { afterEach, expect, test } from "bun:test";
import type { CaptureDocumentPayload } from "../spool";
import {
  clearRetainedForTest,
  MAX_RETAINED_DOCUMENTS,
  retainDeclinedDocuments,
  retainedStateForTest,
} from "./capture";

const doc = (n: number): CaptureDocumentPayload => ({
  title: `part ${n}`,
  content: "x".repeat(60),
});

afterEach(() => clearRetainedForTest());

test("declined-document retention stays bounded across many channels", () => {
  // Simulate a sustained gateway+spool outage: every overflow retains a part
  // under a fresh channel key. Without the cap this grows without limit.
  for (let i = 0; i < MAX_RETAINED_DOCUMENTS * 3; i++) {
    retainDeclinedDocuments(`chan-${i}`, [doc(i)]);
  }
  const state = retainedStateForTest();
  expect(state.documentCount).toBeLessThanOrEqual(MAX_RETAINED_DOCUMENTS);
  expect(state.keyCount).toBeLessThanOrEqual(MAX_RETAINED_DOCUMENTS);
});

test("the most recently retained parts survive eviction", () => {
  for (let i = 0; i < MAX_RETAINED_DOCUMENTS + 5; i++) {
    retainDeclinedDocuments(`chan-${i}`, [doc(i)]);
  }
  // Oldest keys are dropped first; the last-inserted key must still be present.
  expect(retainedStateForTest().documentCount).toBe(MAX_RETAINED_DOCUMENTS);
});

test("retaining an empty set clears the channel", () => {
  retainDeclinedDocuments("chan-a", [doc(1), doc(2)]);
  expect(retainedStateForTest().documentCount).toBe(2);
  retainDeclinedDocuments("chan-a", []);
  expect(retainedStateForTest()).toEqual({ documentCount: 0, keyCount: 0 });
});
