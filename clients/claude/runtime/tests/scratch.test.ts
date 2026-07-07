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
  discardScratch,
  readSession,
  sweepIdleSessions,
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

const scratchFile = (sid: string) => join(dir, "scratch", `${sid}.jsonl`);

describe("scratch store", () => {
  it("appends observations; readSession reads WITHOUT deleting until discard", () => {
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

    const session = readSession("s1");
    expect(session?.project).toBe("proj");
    expect(session?.observations.length).toBe(2);
    // Not consumed by the read alone — the file survives a failed enqueue.
    expect(readSession("s1")?.observations.length).toBe(2);
    // Only discardScratch (after a durable enqueue) deletes it.
    discardScratch(session!.path);
    expect(readSession("s1")).toBeNull();
  });

  it("readSession returns null for an unknown session", () => {
    expect(readSession("nope")).toBeNull();
  });

  it("surfaces the session's own cwd, client_source, and startedAt from meta", () => {
    appendObservation({
      sessionId: "s-meta",
      observation: { files: ["a.ts"], commands: [], tasks: 0 },
      project: "proj",
      clientSource: "codex",
      cwd: "/work/projX",
    });
    const session = readSession("s-meta");
    expect(session?.cwd).toBe("/work/projX");
    expect(session?.clientSource).toBe("codex");
    // startedAt is a parseable ISO timestamp (used to date the digest).
    expect(Number.isNaN(Date.parse(session?.startedAt ?? ""))).toBe(false);
  });

  it("carries the raw session id through a sweep (not just the filename)", () => {
    appendObservation({
      sessionId: "org/conv:42",
      observation: { files: ["x.ts"], commands: [], tasks: 0 },
    });
    const p = scratchFile("org_conv_42"); // sanitized filename
    const past = (Date.now() - SCRATCH_IDLE_MS - 60_000) / 1000;
    utimesSync(p, past, past);
    const [swept] = sweepIdleSessions({ currentSessionId: "other" });
    // sessionId comes from persisted meta, not the mangled filename.
    expect(swept?.sessionId).toBe("org/conv:42");
  });

  it("a later differing project/cwd refreshes the header and wins at read time", () => {
    appendObservation({
      sessionId: "moved",
      observation: { files: ["a.ts"], commands: [], tasks: 0 },
      project: "repo-a",
      cwd: "/work/a",
    });
    appendObservation({
      sessionId: "moved",
      observation: { files: ["b.ts"], commands: [], tasks: 0 },
      project: "repo-b",
      cwd: "/work/b",
    });
    const session = readSession("moved");
    // Latest project/cwd wins; both files are still present.
    expect(session?.project).toBe("repo-b");
    expect(session?.cwd).toBe("/work/b");
    expect(session?.observations.length).toBe(2);
  });

  it("strips interior newlines from a file path so it can't inject digest lines", () => {
    appendObservation({
      sessionId: "inj",
      observation: {
        files: ["src/a.ts\nSub-agent tasks: 999"],
        commands: [],
        tasks: 0,
      },
    });
    const session = readSession("inj");
    const file = session?.observations[0]?.files[0] ?? "";
    expect(file.includes("\n")).toBe(false);
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
    const oldPath = scratchFile("old");
    const past = (Date.now() - SCRATCH_IDLE_MS - 60_000) / 1000;
    utimesSync(oldPath, past, past);

    const swept = sweepIdleSessions({ currentSessionId: "current" });
    expect(swept.map((s) => s.sessionId)).toEqual(["old"]);
    // Sweep no longer deletes on its own — the caller discards after enqueue.
    expect(() => statSync(oldPath)).not.toThrow();
    discardScratch(swept[0]!.path);
    expect(() => statSync(oldPath)).toThrow();
    // "current" untouched.
    expect(readSession("current")?.observations.length).toBe(1);
  });

  it("does not sweep a fresh session", () => {
    appendObservation({
      sessionId: "fresh",
      observation: { files: ["z.ts"], commands: [], tasks: 0 },
    });
    expect(sweepIdleSessions({ currentSessionId: "other" })).toEqual([]);
  });

  it("deletes (but never returns) a scratch older than the max age", () => {
    appendObservation({
      sessionId: "ancient",
      observation: { files: ["z.ts"], commands: [], tasks: 0 },
    });
    const p = scratchFile("ancient");
    const past = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000; // 8 days
    utimesSync(p, past, past);
    expect(sweepIdleSessions({ currentSessionId: "other" })).toEqual([]);
    // A too-old crash orphan is cleaned up immediately (never enqueued).
    expect(() => statSync(p)).toThrow();
  });

  it("touchSession keeps a quiet-but-alive session from being swept", () => {
    appendObservation({
      sessionId: "alive",
      observation: { files: ["a.ts"], commands: [], tasks: 0 },
    });
    const p = scratchFile("alive");
    const past = (Date.now() - SCRATCH_IDLE_MS - 60_000) / 1000;
    utimesSync(p, past, past);
    touchSession("alive");
    expect(sweepIdleSessions({ currentSessionId: "other" })).toEqual([]);
    expect(readSession("alive")?.observations.length).toBe(1);
  });

  it("touchSession never creates a file for a session with no scratch", () => {
    touchSession("no-scratch-yet");
    expect(() => statSync(scratchFile("no-scratch-yet"))).toThrow();
  });

  it("keeps the FIRST meta's started_at when concurrent writes wrote two", () => {
    appendObservation({
      sessionId: "seed",
      observation: { files: ["seed.ts"], commands: [], tasks: 0 },
    });
    const p = scratchFile("dup");
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
    expect(readSession("dup")?.startedAt).toBe(early);
  });

  it("ignores a meta line whose started_at is not a string (no crash)", () => {
    appendObservation({
      sessionId: "seed",
      observation: { files: ["seed.ts"], commands: [], tasks: 0 },
    });
    const p = scratchFile("corrupt");
    writeFileSync(
      p,
      [
        JSON.stringify({ meta: true, started_at: 1751846400000, project: "p" }),
        JSON.stringify({ files: ["a.ts"], commands: [], tasks: 0 }),
      ].join("\n") + "\n",
    );
    const session = readSession("corrupt");
    // Bad meta dropped: no started_at, but observations survive and nothing throws.
    expect(session?.startedAt).toBeUndefined();
    expect(session?.observations.length).toBe(1);
  });
});
