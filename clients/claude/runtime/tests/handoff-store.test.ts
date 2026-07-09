import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replaceHandoff } from "../src/handoff/store.js";
import type { MembaseClient } from "../src/api/client.js";

// replaceHandoff writes a local handoff file via ensureDataDir(); redirect the
// data dir to a temp location so the suite never touches the real ~/.claude
// (which the next real session would then inject as a fresh handoff).
let tempDir: string;
const priorDataDir = process.env.MEMBASE_DATA_DIR;
beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "handoff-store-"));
  process.env.MEMBASE_DATA_DIR = tempDir;
});
afterAll(() => {
  if (priorDataDir === undefined) delete process.env.MEMBASE_DATA_DIR;
  else process.env.MEMBASE_DATA_DIR = priorDataDir;
  rmSync(tempDir, { recursive: true, force: true });
});

function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const deleted: string[] = [];
  const client = {
    searchMemory: async () => {
      calls.push("search");
      return [
        { episode: { uuid: "aaaaaaaa-0000-4000-8000-000000000001", name: "[HANDOFF] old one" } },
        { episode: { uuid: "aaaaaaaa-0000-4000-8000-00000000000f", name: "we chose postgres" } },
        { episode: { uuid: "aaaaaaaa-0000-4000-8000-000000000002", name: "[HANDOFF] old two" } },
      ];
    },
    ingestMemory: async () => {
      calls.push("ingest");
      return { memory_id: "m", revision_id: "r", status: "queued" };
    },
    deleteEpisode: async (uuid: string) => {
      calls.push(`delete:${uuid}`);
      deleted.push(uuid);
    },
    ...overrides,
  } as unknown as MembaseClient;
  return { client, calls, deleted };
}

describe("replaceHandoff (one cloud handoff per project)", () => {
  it("searches BEFORE ingesting and deletes only tagged episodes", async () => {
    const { client, calls, deleted } = makeClient();
    const result = await replaceHandoff(client, {
      summary: "state",
      project: "p",
    });
    expect(calls[0]).toBe("search");
    expect(calls[1]).toBe("ingest");
    expect([...deleted].sort()).toEqual(["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"]);
    expect(result.replaced).toBe(2);
    expect(result.status).toBe("queued");
  });

  it("delete failures are non-fatal and partially counted", async () => {
    let first = true;
    const { client } = makeClient({
      deleteEpisode: async () => {
        if (first) {
          first = false;
          throw new Error("403");
        }
      },
    });
    const result = await replaceHandoff(client, { summary: "state" });
    expect(result.replaced).toBe(1);
  });

  it("unscoped store does not delete project-scoped handoffs", async () => {
    const { client, deleted } = makeClient({
      searchMemory: async () => [
        { episode: { uuid: "bbbbbbbb-0000-4000-8000-000000000001", name: "[HANDOFF] (proj) scoped" } },
        { episode: { uuid: "bbbbbbbb-0000-4000-8000-000000000002", name: "[HANDOFF] unscoped" } },
      ],
    });
    const result = await replaceHandoff(client, { summary: "state" });
    expect(deleted).toEqual(["bbbbbbbb-0000-4000-8000-000000000002"]);
    expect(result.replaced).toBe(1);
  });

  it("search failure degrades to plain append", async () => {
    const { client } = makeClient({
      searchMemory: async () => {
        throw new Error("quota");
      },
    });
    const result = await replaceHandoff(client, { summary: "state" });
    expect(result.replaced).toBe(0);
    expect(result.status).toBe("queued");
  });
});
