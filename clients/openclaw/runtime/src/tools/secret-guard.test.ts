// The explicit store tools must reject secret-looking content BEFORE it
// reaches the client (parity with the Claude MCP server's looksSensitive
// gate). These tests register each tool against a client that throws on any
// write, so a passing test proves the guard short-circuits before ingest.
import { describe, expect, test } from "bun:test";
import { registerAddWikiTool } from "./add-wiki";
import { registerHandoffTool } from "./handoff";
import { registerStoreTool } from "./store";
import { registerUpdateWikiTool } from "./update-wiki";

const SECRET = "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----";

// A client that fails loudly if any write path is reached — the guard must
// return before we get here.
function explodingClient() {
  const boom = () => {
    throw new Error("client was called — guard did not short-circuit");
  };
  return {
    ingest: boom,
    createWikiDocument: boom,
    updateWikiDocument: boom,
    search: async () => [],
    deleteMemory: boom,
  } as never;
}

// Capture the execute() handler a tool registers.
function capture(
  register: (api: never, client: never) => void,
  client = explodingClient(),
) {
  let execute!: (id: string, params: never) => Promise<{ content: unknown }>;
  const api = {
    registerTool: (def: { execute: typeof execute }) => {
      execute = def.execute;
    },
  };
  register(api as never, client);
  return execute;
}

function textOf(res: { content: unknown }): string {
  const content = res.content as Array<{ text: string }>;
  return content.map((c) => c.text).join("\n");
}

describe("explicit-store secret guard", () => {
  test("membase_store rejects secret content", async () => {
    const execute = capture(registerStoreTool);
    const res = await execute("id", {
      content: SECRET,
      display_summary: "a key",
    } as never);
    expect(textOf(res)).toContain("looks like a secret");
  });

  test("membase_add_wiki rejects secret content", async () => {
    const execute = capture(registerAddWikiTool);
    const res = await execute("id", {
      title: "keys",
      content: SECRET,
    } as never);
    expect(textOf(res)).toContain("looks like a secret");
  });

  test("membase_update_wiki rejects secret content", async () => {
    const execute = capture(registerUpdateWikiTool);
    const res = await execute("id", {
      doc_id: "d1",
      content: SECRET,
    } as never);
    expect(textOf(res)).toContain("looks like a secret");
  });

  test("membase_handoff rejects secret summary on store", async () => {
    const execute = capture(registerHandoffTool);
    const res = await execute("id", {
      mode: "store",
      summary: SECRET,
    } as never);
    expect(textOf(res)).toContain("looks like a secret");
  });

  test("membase_store still stores non-secret content", async () => {
    let ingested = false;
    const client = {
      ingest: async () => {
        ingested = true;
        return { status: "queued" };
      },
    } as never;
    const execute = capture(registerStoreTool, client);
    await execute("id", {
      content: "I prefer dark mode",
      display_summary: "pref",
    } as never);
    expect(ingested).toBe(true);
  });
});
