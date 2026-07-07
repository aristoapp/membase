import { describe, expect, it } from "bun:test";
import { replaceHandoff } from "../src/handoff/store.js";
import type { MembaseClient } from "../src/api/client.js";

function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const deleted: string[] = [];
  const client = {
    searchMemory: async () => {
      calls.push("search");
      return [
        { episode: { uuid: "u-old-1", name: "[HANDOFF] old one" } },
        { episode: { uuid: "u-noise", name: "we chose postgres" } },
        { episode: { uuid: "u-old-2", name: "[HANDOFF] old two" } },
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
    expect([...deleted].sort()).toEqual(["u-old-1", "u-old-2"]);
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
        { episode: { uuid: "u-scoped", name: "[HANDOFF] (proj) scoped" } },
        { episode: { uuid: "u-free", name: "[HANDOFF] unscoped" } },
      ],
    });
    const result = await replaceHandoff(client, { summary: "state" });
    expect(deleted).toEqual(["u-free"]);
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
