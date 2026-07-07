import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "handoff-file-"));
  dirs.push(dir);
  process.env.MEMBASE_DATA_DIR = dir;
  return dir;
}

afterEach(() => {
  delete process.env.MEMBASE_DATA_DIR;
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("local handoff file", () => {
  it("write→read round-trips per project and reports mtime", async () => {
    tempDataDir();
    const { writeHandoffFile, readLocalHandoff, handoffFilePath } =
      await import("../src/handoff/file.js");
    writeHandoffFile("resume step 3", "proj-a");
    writeHandoffFile("other project", "proj-b");
    const a = readLocalHandoff({ clientSource: "claude-code", projectSlug: "proj-a" });
    expect(a?.text).toBe("resume step 3");
    expect(typeof a?.storedAtMs).toBe("number");
    // stale mtime propagates
    const eightDays = Date.now() - 8 * 86_400_000;
    utimesSync(handoffFilePath("proj-a"), eightDays / 1000, eightDays / 1000);
    const stale = readLocalHandoff({ clientSource: "claude-code", projectSlug: "proj-a" });
    expect((stale?.storedAtMs ?? 0) < Date.now() - 7 * 86_400_000).toBe(true);
  });

  it("missing project file returns null; unscoped uses its own bucket", async () => {
    tempDataDir();
    const { writeHandoffFile, readLocalHandoff } = await import("../src/handoff/file.js");
    expect(readLocalHandoff({ clientSource: "claude-code", projectSlug: "nope" })).toBeNull();
    writeHandoffFile("global state");
    expect(readLocalHandoff({ clientSource: "claude-code" })?.text).toBe("global state");
  });
});
