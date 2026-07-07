import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendObservation,
  sweepIdleSessions,
  takeSession,
  SCRATCH_IDLE_MS,
} from "../src/scratch/index.js";

let dir: string;
let prevDataDir: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "membase-scratch-"));
  prevDataDir = process.env.MEMBASE_DATA_DIR;
  process.env.MEMBASE_DATA_DIR = dir;
});

afterEach(() => {
  if (prevDataDir === undefined) delete process.env.MEMBASE_DATA_DIR;
  else process.env.MEMBASE_DATA_DIR = prevDataDir;
  rmSync(dir, { recursive: true, force: true });
});

describe("scratch store", () => {
  it("appends observations and takeSession consumes them", () => {
    appendObservation({
      sessionId: "s1",
      observation: { files: ["a.ts"], commands: [], tasks: 0 },
      project: "proj",
    });
    appendObservation({
      sessionId: "s1",
      observation: { files: [], commands: ["git push"], tasks: 0 },
      project: "proj",
    });

    const session = takeSession("s1");
    expect(session?.project).toBe("proj");
    expect(session?.observations.length).toBe(2);
    // consumed: a second take finds nothing
    expect(takeSession("s1")).toBeNull();
  });

  it("takeSession returns null for an unknown session", () => {
    expect(takeSession("nope")).toBeNull();
  });

  it("sweep only collects idle sessions and excludes the current one", () => {
    appendObservation({
      sessionId: "old",
      observation: { files: ["x.ts"], commands: [], tasks: 0 },
    });
    appendObservation({
      sessionId: "current",
      observation: { files: ["y.ts"], commands: [], tasks: 0 },
    });
    // Age "old" past the idle threshold.
    const oldPath = join(dir, "scratch", "old.jsonl");
    const past = (Date.now() - SCRATCH_IDLE_MS - 60_000) / 1000;
    utimesSync(oldPath, past, past);

    const swept = sweepIdleSessions({ currentSessionId: "current" });
    expect(swept.map((s) => s.sessionId)).toEqual(["old"]);
    // "current" untouched, "old" consumed
    expect(() => statSync(oldPath)).toThrow();
    expect(takeSession("current")?.observations.length).toBe(1);
  });

  it("does not sweep a fresh session", () => {
    appendObservation({
      sessionId: "fresh",
      observation: { files: ["z.ts"], commands: [], tasks: 0 },
    });
    expect(sweepIdleSessions({ currentSessionId: "other" })).toEqual([]);
  });
});
