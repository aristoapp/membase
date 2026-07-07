import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendObservation,
  sweepIdleSessions,
  takeSession,
  touchSession,
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

  it("takeSession surfaces the session's own cwd and startedAt from meta", () => {
    appendObservation({
      sessionId: "s-meta",
      observation: { files: ["a.ts"], commands: [], tasks: 0 },
      project: "proj",
      cwd: "/work/projX",
    });
    const session = takeSession("s-meta");
    expect(session?.cwd).toBe("/work/projX");
    // startedAt is a parseable ISO timestamp (used to date the digest).
    expect(Number.isNaN(Date.parse(session?.startedAt ?? ""))).toBe(false);
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

  it("touchSession keeps a quiet-but-alive session from being swept", () => {
    appendObservation({
      sessionId: "alive",
      observation: { files: ["a.ts"], commands: [], tasks: 0 },
    });
    // Session went quiet long enough to look idle...
    const p = join(dir, "scratch", "alive.jsonl");
    const past = (Date.now() - SCRATCH_IDLE_MS - 60_000) / 1000;
    utimesSync(p, past, past);
    // ...but its Stop touched it, so another window's sweep must not take it.
    touchSession("alive");
    expect(sweepIdleSessions({ currentSessionId: "other" })).toEqual([]);
    // Still fully intact.
    expect(takeSession("alive")?.observations.length).toBe(1);
  });

  it("touchSession never creates a file for a session with no scratch", () => {
    touchSession("no-scratch-yet");
    expect(() => statSync(join(dir, "scratch", "no-scratch-yet.jsonl"))).toThrow();
  });

  it("keeps the FIRST meta header when concurrent writes wrote two", () => {
    // Simulate the async-hook race: two meta headers, earliest start first.
    // Append once first so the scratch/ dir exists before we hand-write the file.
    appendObservation({
      sessionId: "seed",
      observation: { files: ["seed.ts"], commands: [], tasks: 0 },
    });
    const p = join(dir, "scratch", "dup.jsonl");
    const early = "2026-07-07T01:00:00.000Z";
    const late = "2026-07-07T02:00:00.000Z";
    writeFileSync(
      p,
      [
        JSON.stringify({ meta: true, started_at: early, project: "p" }),
        JSON.stringify({ files: ["a.ts"], commands: [], tasks: 0 }),
        JSON.stringify({ meta: true, started_at: late, project: "p" }),
      ].join("\n") + "\n",
    );
    expect(takeSession("dup")?.startedAt).toBe(early);
  });
});
