import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
// Save the ambient value so afterEach RESTORES it rather than blanket-deleting
// it — bun runs every test file in one process, so an unconditional delete
// would leak into later files (dropping a dev's `MEMBASE_DATA_DIR=/tmp/x`
// redirect and letting them fall back to the real ~/.claude data dir).
const priorDataDir = process.env.MEMBASE_DATA_DIR;
function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "handoff-file-"));
  dirs.push(dir);
  process.env.MEMBASE_DATA_DIR = dir;
  return dir;
}

afterEach(() => {
  if (priorDataDir === undefined) delete process.env.MEMBASE_DATA_DIR;
  else process.env.MEMBASE_DATA_DIR = priorDataDir;
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

  it("empty / whitespace-only file returns null", async () => {
    tempDataDir();
    const { writeHandoffFile, readLocalHandoff } = await import("../src/handoff/file.js");
    writeHandoffFile("   \n\t  ", "blank");
    expect(readLocalHandoff({ clientSource: "claude-code", projectSlug: "blank" })).toBeNull();
  });
});

describe("codex candidate resolution", () => {
  function codexFile(root: string, body: string): string {
    const dir = join(root, ".codex");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "membase-handoff.md");
    writeFileSync(path, body);
    return path;
  }

  it("MEMBASE_HANDOFF_FILE overrides the cwd/home candidates", async () => {
    tempDataDir();
    const cwd = mkdtempSync(join(tmpdir(), "codex-cwd-"));
    dirs.push(cwd);
    const override = codexFile(cwd, "from override");
    process.env.MEMBASE_HANDOFF_FILE = override;
    try {
      const { readLocalHandoff } = await import("../src/handoff/file.js");
      const found = readLocalHandoff({ clientSource: "codex", cwd });
      expect(found?.text).toBe("from override");
    } finally {
      delete process.env.MEMBASE_HANDOFF_FILE;
    }
  });

  it("defaults to project .codex then home .codex; a stale project file does not shadow a fresh home file", async () => {
    tempDataDir();
    const cwd = mkdtempSync(join(tmpdir(), "codex-cwd-"));
    const home = mkdtempSync(join(tmpdir(), "codex-home-"));
    dirs.push(cwd, home);
    const priorHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const { readLocalHandoff } = await import("../src/handoff/file.js");
      // Fresh project file wins over home file.
      codexFile(cwd, "project handoff");
      codexFile(home, "home handoff");
      expect(readLocalHandoff({ clientSource: "codex", cwd })?.text).toBe(
        "project handoff",
      );
      // Make the project file stale (>7d): the fresh home file must win now.
      const eightDays = (Date.now() - 8 * 86_400_000) / 1000;
      utimesSync(join(cwd, ".codex", "membase-handoff.md"), eightDays, eightDays);
      expect(readLocalHandoff({ clientSource: "codex", cwd })?.text).toBe(
        "home handoff",
      );
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });
});
