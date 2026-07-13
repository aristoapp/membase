// Ported from the standalone openclaw-membase repo (v0.5.0) as regression
// cover for the Project-based wiki filing feature set. The auto-capture cases
// are adapted to the monorepo's failure-path design: a failed wiki part goes
// to the disk spool (spool.ts) and `dream` resumes it, instead of living only
// in RAM.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MembaseClient } from "./client";
import { registerCli } from "./commands/cli";
import {
  resolveDefaultTokenFilePath,
  resolveOpenClawConfigPath,
  resolveTokenFilePath,
} from "./config";
import { formatBundles, formatWikiDocument } from "./format";
import { flushAllBuffers, registerCaptureHook } from "./hooks/capture";
import { flushCaptureSpool, getCaptureSpool, resetCaptureSpoolForTest } from "./spool";
import { registerAddWikiTool } from "./tools/add-wiki";
import {
  buildCurrentDateText,
  localIsoString,
  registerCurrentDateTool,
} from "./tools/current-date";
import { registerDeleteWikiTool } from "./tools/delete-wiki";
import { MEMORY_SOURCES, registerSearchTool } from "./tools/search";
import { registerUpdateWikiTool } from "./tools/update-wiki";
import type { OpenClawPluginApi, ToolDefinition } from "./types";

const originalFetch = globalThis.fetch;

// Auto-capture failure paths write to the disk spool; isolate it per test.
let dataDir: string;
let prevDataDirEnv: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "oc-tools-"));
  prevDataDirEnv = process.env.MEMBASE_DATA_DIR;
  process.env.MEMBASE_DATA_DIR = dataDir;
  resetCaptureSpoolForTest();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (prevDataDirEnv === undefined) delete process.env.MEMBASE_DATA_DIR;
  else process.env.MEMBASE_DATA_DIR = prevDataDirEnv;
  resetCaptureSpoolForTest();
  rmSync(dataDir, { recursive: true, force: true });
});

function makeApi(): { api: OpenClawPluginApi; tools: ToolDefinition[] } {
  const tools: ToolDefinition[] = [];
  return {
    tools,
    api: {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      registerTool: (tool) => tools.push(tool),
      registerCli: () => {},
      registerService: () => {},
      on: () => {},
    },
  };
}

function makeClient() {
  return new MembaseClient("https://api.test", {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    clientId: "client-id",
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch;
}

function toolText(result: { content: Array<{ text: string }> }): string {
  return result.content[0]?.text ?? "";
}

// A capture-hook harness: registers the hook and exposes the agent_end handler.
function makeCaptureApi() {
  let handler: ((event: Record<string, unknown>) => Promise<void>) | undefined;
  const api: OpenClawPluginApi = {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    registerTool: () => {},
    registerCli: () => {},
    registerService: () => {},
    on: (_event, cb) => {
      handler = cb as (event: Record<string, unknown>) => Promise<void>;
    },
  };
  return { api, fire: (event: Record<string, unknown>) => handler?.(event) };
}

interface CreatedDoc {
  title: string;
  content: string;
  options?: Record<string, unknown>;
}

function makeWikiClient(behavior?: {
  shouldFail?: (doc: CreatedDoc) => boolean;
}): { client: MembaseClient; created: CreatedDoc[] } {
  const created: CreatedDoc[] = [];
  const client = {
    createWikiDocument: async (
      title: string,
      content: string,
      options?: Record<string, unknown>,
    ) => {
      const doc = { title, content, options };
      if (behavior?.shouldFail?.(doc)) {
        throw new Error("temporary wiki outage");
      }
      created.push(doc);
      return {
        id: `doc-${created.length}`,
        title,
        content,
        user_id: "user-1",
        collection_id: null,
        metadata: {},
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      };
    },
  };
  return { client: client as unknown as MembaseClient, created };
}

describe("tool schemas", () => {
  test("membase_search includes current memory sources", () => {
    expect(MEMORY_SOURCES).toContain("codex");
    expect(MEMORY_SOURCES).toContain("hermes");
    expect(MEMORY_SOURCES).toContain("notion");

    const { api, tools } = makeApi();
    registerSearchTool(api, makeClient());
    expect(tools).toHaveLength(1);
    const searchTool = tools[0];
    if (!searchTool) {
      throw new Error("search tool was not registered");
    }
    const sources = (
      searchTool.parameters.properties as Record<
        string,
        { items?: { enum?: string[] } }
      >
    ).sources;
    expect(sources?.items?.enum).toContain("codex");
    expect(sources?.items?.enum).toContain("hermes");
    expect(sources?.items?.enum).toContain("notion");
  });

  test("membase_get_current_date is registered", () => {
    const { api, tools } = makeApi();
    registerCurrentDateTool(api);
    expect(tools[0]?.name).toBe("membase_get_current_date");
    expect(tools[0]?.description).toContain("date_from/date_to");
  });
});

describe("OpenClaw profile paths", () => {
  test("uses OPENCLAW_STATE_DIR for default token and config paths", () => {
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    const previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    try {
      process.env.OPENCLAW_STATE_DIR = "/tmp/openclaw-membase-profile";
      delete process.env.OPENCLAW_CONFIG_PATH;

      expect(resolveOpenClawConfigPath()).toBe(
        "/tmp/openclaw-membase-profile/openclaw.json",
      );
      expect(resolveDefaultTokenFilePath()).toBe(
        "/tmp/openclaw-membase-profile/credentials/openclaw-membase.json",
      );
      expect(resolveTokenFilePath({})).toBe(
        "/tmp/openclaw-membase-profile/credentials/openclaw-membase.json",
      );
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
      if (previousConfigPath === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
      }
    }
  });

  test("uses OPENCLAW_CONFIG_PATH when it is explicitly provided", () => {
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    const previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    try {
      process.env.OPENCLAW_STATE_DIR = "/tmp/openclaw-membase-profile";
      process.env.OPENCLAW_CONFIG_PATH = "/tmp/custom-openclaw.json";

      expect(resolveOpenClawConfigPath()).toBe("/tmp/custom-openclaw.json");
      expect(resolveDefaultTokenFilePath()).toBe(
        "/tmp/openclaw-membase-profile/credentials/openclaw-membase.json",
      );
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
      if (previousConfigPath === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
      }
    }
  });
});

describe("OpenClaw CLI commands", () => {
  function makeCliApi(collect: {
    info?: string[];
    error?: string[];
    onHandler: (name: string, handler: (...args: unknown[]) => Promise<void> | void) => void;
  }): OpenClawPluginApi {
    const makeCommand = (name: string): Record<string, unknown> => {
      const command = {
        description: () => command,
        option: () => command,
        command: (childName: string) => makeCommand(`${name} ${childName}`),
        action: (nextHandler: (...args: unknown[]) => Promise<void> | void) => {
          collect.onHandler(name, nextHandler);
          return command;
        },
      };
      return command;
    };
    return {
      logger: {
        info: (msg: unknown) => collect.info?.push(String(msg)),
        warn: () => {},
        error: (...args: unknown[]) =>
          collect.error?.push(args.map(String).join(" ")),
      },
      registerTool: () => {},
      registerCli: (registrar) => {
        (registrar as (args: { program: unknown }) => void)({
          program: { command: (name: string) => makeCommand(name) },
        });
      },
      registerService: () => {},
      on: () => {},
    };
  }

  test("wiki-add accepts a positional title and option object", async () => {
    let handler: ((...args: unknown[]) => Promise<void> | void) | undefined;
    const infoMessages: string[] = [];
    const api = makeCliApi({
      info: infoMessages,
      onHandler: (name, nextHandler) => {
        if (name === "membase wiki-add <title>") handler = nextHandler;
      },
    });
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: "collection-1",
        title: "CLI Title",
        content: "CLI Body",
        metadata: {},
        status: "active",
        source: "openclaw",
        routing: {
          collection_id: "collection-1",
          collection_name: "Docs",
          routing_source: "explicit_project",
          fallback: false,
        },
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    registerCli(api, makeClient());
    expect(handler).toBeDefined();
    await handler?.("CLI Title", {
      content: "CLI Body",
      project: "Docs",
    });

    expect(requestBody).toMatchObject({
      title: "CLI Title",
      content: "CLI Body",
      project: "Docs",
      source: "openclaw",
    });
    expect(infoMessages[0]).toBe(
      'Wiki document created: "CLI Title" (ID: doc-1). Saved to Project: Docs.',
    );
  });

  test("wiki-add rejects sensitive content before sending a request", async () => {
    let handler: ((...args: unknown[]) => Promise<void> | void) | undefined;
    const errorMessages: string[] = [];
    const api = makeCliApi({
      error: errorMessages,
      onHandler: (name, nextHandler) => {
        if (name === "membase wiki-add <title>") handler = nextHandler;
      },
    });

    let fetchCalls = 0;
    mockFetch(() => {
      fetchCalls += 1;
      return jsonResponse({});
    });

    registerCli(api, makeClient());
    await handler?.("CLI Title", {
      content: "TOKEN=redacted-placeholder",
    });

    expect(errorMessages[0]).toContain(
      "content appears to contain secrets or private credentials",
    );
    expect(fetchCalls).toBe(0);
  });

  test("wiki-add forwards a -c collection UUID as collection_id, not a project name", async () => {
    let handler: ((...args: unknown[]) => Promise<void> | void) | undefined;
    const api = makeCliApi({
      onHandler: (name, nextHandler) => {
        if (name === "membase wiki-add <title>") handler = nextHandler;
      },
    });
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: "00000000-0000-0000-0000-000000000001",
        title: "CLI Title",
        content: "CLI Body",
        metadata: {},
        status: "active",
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    registerCli(api, makeClient());
    // commander maps `-c <uuid>` to opts.collectionId (never a project name).
    await handler?.("CLI Title", {
      content: "CLI Body",
      collectionId: "00000000-0000-0000-0000-000000000001",
    });

    expect(requestBody).toMatchObject({
      collection_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(requestBody).not.toHaveProperty("project");
  });
});

describe("wiki client payloads", () => {
  test("createWikiDocument sends project, source, and source metadata", async () => {
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: "collection-1",
        title: "Title",
        content: "Content",
        metadata: {},
        status: "active",
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    await makeClient().createWikiDocument("Title", "Content", {
      project: "Docs",
    });

    expect(requestBody).toMatchObject({
      title: "Title",
      content: "Content",
      source: "openclaw",
      project: "Docs",
      source_metadata: {
        plugin_name: "openclaw-membase",
        host: "openclaw",
      },
    });
    expect(requestBody).not.toHaveProperty("summarize");
    expect(requestBody).not.toHaveProperty("metadata");
    expect(requestBody).not.toHaveProperty("collection");
  });

  test("createWikiDocument merges safe capture source metadata", async () => {
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: "collection-1",
        title: "Title",
        content: "Content",
        metadata: {},
        status: "active",
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    await makeClient().createWikiDocument("Title", "Content", {
      sourceMetadata: {
        capture_kind: "conversation_transcript",
        plugin_name: "spoofed",
        host: "spoofed",
      },
    });

    expect(requestBody).toMatchObject({
      source_metadata: {
        plugin_name: "openclaw-membase",
        plugin_version: expect.any(String),
        host: "openclaw",
        capture_kind: "conversation_transcript",
      },
    });
    expect(
      (requestBody as { source_metadata?: Record<string, unknown> })
        .source_metadata,
    ).not.toHaveProperty("session_key");
  });

  test("updateWikiDocument sends project removal without metadata patch fields", async () => {
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: null,
        title: "Title",
        content: "Content",
        metadata: {},
        status: "active",
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    await makeClient().updateWikiDocument("doc-1", {
      project: null,
    });

    expect(requestBody).toEqual({
      collection_id: null,
    });
  });

  test("searchWiki separates project and collection ID query params", async () => {
    const urls: string[] = [];
    mockFetch((url) => {
      urls.push(url);
      return jsonResponse({ documents: [], total_count: 0 });
    });

    const client = makeClient();
    await client.searchWiki("migration", 5, { project: "Docs" });
    await client.searchWiki("migration", 5, {
      collectionId: "00000000-0000-0000-0000-000000000001",
    });

    expect(urls[0]).toContain("project=Docs");
    expect(urls[0]).not.toContain("collection_id=");
    expect(urls[1]).toContain(
      "collection_id=00000000-0000-0000-0000-000000000001",
    );
    expect(urls[1]).not.toContain("collection=Docs");
  });

  test("legacy collection aliases are normalized to project", async () => {
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: "collection-1",
        title: "Title",
        content: "Content",
        metadata: {},
        status: "active",
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    await makeClient().createWikiDocument("Title", "Content", {
      collection: "Legacy Docs",
    });

    expect(requestBody).toMatchObject({
      project: "Legacy Docs",
    });
    expect(requestBody).not.toHaveProperty("collection");
  });

  test("createWikiDocument files into a collection UUID when only an id is given", async () => {
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: "00000000-0000-0000-0000-000000000001",
        title: "Title",
        content: "Content",
        metadata: {},
        status: "active",
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    await makeClient().createWikiDocument("Title", "Content", {
      collectionId: "00000000-0000-0000-0000-000000000001",
    });

    expect(requestBody).toMatchObject({
      collection_id: "00000000-0000-0000-0000-000000000001",
    });
    expect(requestBody).not.toHaveProperty("project");
  });

  test("a Project name takes precedence over a collection UUID", async () => {
    let requestBody: unknown;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse({
        id: "doc-1",
        user_id: "user-1",
        collection_id: "collection-1",
        title: "Title",
        content: "Content",
        metadata: {},
        status: "active",
        source: "openclaw",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      });
    });

    await makeClient().createWikiDocument("Title", "Content", {
      project: "Docs",
      collectionId: "00000000-0000-0000-0000-000000000001",
    });

    expect(requestBody).toMatchObject({ project: "Docs" });
    expect(requestBody).not.toHaveProperty("collection_id");
  });
});

describe("auto capture", () => {
  test("stores user and assistant transcript in Wiki", async () => {
    const { api, fire } = makeCaptureApi();
    const { client, created } = makeWikiClient();

    registerCaptureHook(api, client, api.logger);
    await fire({
      success: true,
      sessionKey: "session-1",
      messages: [
        { role: "user", content: "Please keep this implementation context." },
        { role: "assistant", content: "I changed the wiki capture flow." },
      ],
    });
    await flushAllBuffers(client, api.logger);

    expect(created).toHaveLength(1);
    expect(created[0]?.title).toContain("OpenClaw conversation capture");
    expect(created[0]?.content).toContain("### User");
    expect(created[0]?.content).toContain(
      "Please keep this implementation context.",
    );
    expect(created[0]?.content).toContain("### Assistant");
    expect(created[0]?.content).toContain("I changed the wiki capture flow.");
    expect(created[0]?.content).not.toContain("Session:");
    expect(created[0]?.options).toMatchObject({
      sourceMetadata: {
        capture_kind: "conversation_transcript",
      },
    });
    expect(
      created[0]?.options?.sourceMetadata as Record<string, unknown>,
    ).not.toHaveProperty("session_key");
  });

  test("splits large transcript captures into sequential Wiki documents", async () => {
    const { api, fire } = makeCaptureApi();
    const { client, created } = makeWikiClient();

    registerCaptureHook(api, client, api.logger);
    await fire({
      success: true,
      sessionKey: "session-large",
      messages: [
        { role: "user", content: "Please keep this large transcript." },
        { role: "assistant", content: "A".repeat(140_000) },
      ],
    });
    await flushAllBuffers(client, api.logger);

    expect(created.length).toBeGreaterThan(1);
    for (const [index, doc] of created.entries()) {
      expect(doc.title).toContain(`part ${index + 1}`);
      expect(doc.content.length).toBeLessThanOrEqual(95_000);
      expect(doc.options).toMatchObject({
        sourceMetadata: {
          capture_kind: "conversation_transcript",
          part_index: index + 1,
          part_total: created.length,
        },
      });
      expect(
        doc.options?.sourceMetadata as Record<string, unknown>,
      ).not.toHaveProperty("session_key");
    }
  });

  test("spools only unsaved Wiki parts; dream resumes from the first unuploaded part", async () => {
    const { api, fire } = makeCaptureApi();
    let failSecondPart = true;
    const { client, created } = makeWikiClient({
      shouldFail: (doc) => {
        const partIndex = Number(
          (doc.options?.sourceMetadata as Record<string, unknown> | undefined)
            ?.part_index ?? 1,
        );
        if (failSecondPart && partIndex === 2) {
          failSecondPart = false;
          return true;
        }
        return false;
      },
    });

    registerCaptureHook(api, client, api.logger);
    await fire({
      success: true,
      sessionKey: "session-partial",
      messages: [
        { role: "user", content: "Please keep this large transcript." },
        { role: "assistant", content: "A".repeat(140_000) },
      ],
    });
    await flushAllBuffers(client, api.logger);

    // Part 1 uploaded live; part 2 failed and was spooled as a document
    // payload instead of retried from RAM.
    const livePartIndexes = created.map((doc) =>
      Number(
        (doc.options?.sourceMetadata as Record<string, unknown> | undefined)
          ?.part_index,
      ),
    );
    expect(livePartIndexes).toEqual([1]);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);

    // The drain resumes document creation for exactly the unuploaded part.
    const result = await flushCaptureSpool(client);
    expect(result.flushed).toBe(1);
    expect(result.remaining).toBe(0);

    const partIndexes = created.map((doc) =>
      Number(
        (doc.options?.sourceMetadata as Record<string, unknown> | undefined)
          ?.part_index,
      ),
    );
    expect(partIndexes.filter((part) => part === 1)).toHaveLength(1);
    expect(partIndexes).toContain(2);
    const partTotals = created.map((doc) =>
      Number(
        (doc.options?.sourceMetadata as Record<string, unknown> | undefined)
          ?.part_total,
      ),
    );
    expect(new Set(partTotals).size).toBe(1);
  });

  test("keeps new channel messages flowing after a failed part is spooled", async () => {
    const { api, fire } = makeCaptureApi();
    let failSecondPart = true;
    const { client, created } = makeWikiClient({
      shouldFail: (doc) => {
        const partIndex = (
          doc.options?.sourceMetadata as Record<string, unknown> | undefined
        )?.part_index;
        if (failSecondPart && partIndex === 2) {
          failSecondPart = false;
          return true;
        }
        return false;
      },
    });

    registerCaptureHook(api, client, api.logger);
    await fire({
      success: true,
      sessionKey: "session-pending-with-new",
      messages: [
        { role: "user", content: "Please keep this large transcript." },
        { role: "assistant", content: "A".repeat(140_000) },
      ],
    });
    await flushAllBuffers(client, api.logger);
    expect(getCaptureSpool().pendingSpoolCount()).toBe(1);

    await fire({
      success: true,
      sessionKey: "session-pending-with-new",
      messages: [
        { role: "user", content: "Please keep this follow-up." },
        { role: "assistant", content: "Follow-up saved after retry." },
      ],
    });
    await flushAllBuffers(client, api.logger);

    expect(created.map((doc) => doc.content).join("\n")).toContain(
      "Please keep this follow-up.",
    );
    expect(created.map((doc) => doc.content).join("\n")).toContain(
      "Follow-up saved after retry.",
    );
  });

  test("a fully failed max-size flush is spooled and recovered by dream", async () => {
    const { api, fire } = makeCaptureApi();
    let failFirstFlush = true;
    const { client, created } = makeWikiClient({
      shouldFail: () => {
        if (failFirstFlush) {
          failFirstFlush = false;
          return true;
        }
        return false;
      },
    });

    registerCaptureHook(api, client, api.logger);
    for (let index = 0; index < 10; index += 1) {
      await fire({
        success: true,
        sessionKey: "session-max-buffer",
        messages: [
          { role: "user", content: `Buffered user message ${index}.` },
          {
            role: "assistant",
            content: `Buffered assistant message ${index}.`,
          },
        ],
      });
    }

    // The overflow flush failed before uploading anything, so the whole
    // document set is on disk, not in RAM.
    expect(getCaptureSpool().pendingSpoolCount()).toBeGreaterThan(0);
    await flushCaptureSpool(client);

    const combined = created.map((doc) => doc.content).join("\n");
    expect(combined).toContain("Buffered user message 0.");
    expect(combined).toContain("Buffered assistant message 8.");

    // Clear the silence timers scheduled for the residual channel buffer.
    await flushAllBuffers(client, api.logger);
  });
});

describe("formatters", () => {
  test("memory formatter includes source, project, relevance, and temporal facts", () => {
    const text = formatBundles([
      {
        relevance_score: 0.42,
        episode: {
          uuid: "episode-1",
          name: "Planning meeting",
          summary: "Discussed launch scope",
          source: "slack",
          created_at: "2026-05-25T00:00:00Z",
          valid_at: "2026-05-24T00:00:00Z",
          attributes: { project: "membase" },
        },
        edges: [
          {
            uuid: "edge-1",
            name: "fact",
            fact: "Launch scope changed",
            created_at: "2026-05-25T00:00:00Z",
            valid_at: "2026-05-24T00:00:00Z",
          },
        ],
      },
    ]);

    expect(text).toContain("[relevance: 0.4200]");
    expect(text).toContain("[source: slack, project: membase]");
    expect(text).toContain(
      "Launch scope changed (valid_at=2026-05-24T00:00:00Z)",
    );
  });

  test("wiki formatter includes source status, warning, and dates", () => {
    const text = formatWikiDocument(
      {
        id: "doc-1",
        title: "Runbook",
        content: "Full content stays visible.",
        metadata: {},
        source: "notion",
        source_status: "inaccessible",
        source_warning: "Source page is no longer accessible.",
        source_last_checked_at: "2026-05-18T00:00:00Z",
        source_references: [
          {
            source: "notion",
            title: "Ops Runbook",
            url: "https://notion.so/runbook",
            status: "active",
            link_type: "primary",
          },
          {
            source: "upload",
            title: "Imported Markdown",
            status: "active",
            link_type: "supporting",
          },
        ],
        collection_id: "collection-1",
        collection_name: "Ops",
        similarity: 0.7,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-02T00:00:00Z",
      },
      0,
    );

    expect(text).toContain(
      "Source: Notion - Ops Runbook (https://notion.so/runbook); +1 additional reference",
    );
    expect(text).toContain("source_status: inaccessible");
    expect(text).toContain(
      "source_warning: Source page is no longer accessible.",
    );
    expect(text).toContain("created: 2026-05-01");
    expect(text).toContain("updated: 2026-05-02");
    expect(text).toContain("Full content stays visible.");
    expect(text).toContain("[Project: Ops]");
  });

  test("wiki formatter labels Basic and unknown Projects", () => {
    const basic = formatWikiDocument(
      {
        id: "doc-1",
        title: "Basic Note",
        content: "",
        metadata: {},
        source: "manual",
        collection_id: null,
        collection_name: null,
        similarity: null,
        created_at: null,
        updated_at: null,
      },
      0,
    );
    const unknown = formatWikiDocument(
      {
        id: "doc-2",
        title: "Unnamed Project Note",
        content: "",
        metadata: {},
        source: "manual",
        collection_id: "collection-2",
        collection_name: null,
        similarity: null,
        created_at: null,
        updated_at: null,
      },
      1,
    );

    expect(basic).toContain("1. Basic Note [Project: Basic]");
    expect(unknown).toContain("2. Unnamed Project Note [Project: Unknown]");
  });
});

describe("wiki tool schemas", () => {
  test("add and update wiki tools reject sensitive content before API calls", async () => {
    const { api, tools } = makeApi();
    registerAddWikiTool(api, makeClient());
    registerUpdateWikiTool(api, makeClient());

    let fetchCalls = 0;
    mockFetch(() => {
      fetchCalls += 1;
      return jsonResponse({});
    });

    const addResult = await tools[0]?.execute("call-1", {
      title: "Secrets",
      content: "API_KEY=redacted-placeholder",
    });
    const updateResult = await tools[1]?.execute("call-2", {
      doc_id: "doc-1",
      content: "Authorization: Bearer redacted-placeholder",
    });

    if (!addResult || !updateResult) {
      throw new Error("wiki tools were not registered");
    }
    // The monorepo funnels all write tools through the shared
    // rejectIfSensitive gate (tool-response.ts), whose message differs from
    // the standalone's inline one.
    expect(toolText(addResult)).toContain("looks like a secret");
    expect(toolText(updateResult)).toContain("looks like a secret");
    expect(fetchCalls).toBe(0);
  });

  test("add and update wiki tools report returned destinations", async () => {
    const { api, tools } = makeApi();
    registerAddWikiTool(api, makeClient());
    registerUpdateWikiTool(api, makeClient());

    mockFetch((url, init) => {
      if (url.endsWith("/agents/usage")) {
        return jsonResponse({ status: "ok" });
      }
      if (init.method === "POST" && url.endsWith("/wiki/documents")) {
        return jsonResponse({
          id: "doc-1",
          user_id: "user-1",
          collection_id: "project-1",
          title: "Routing",
          content: "Body",
          metadata: {},
          status: "active",
          source: "openclaw",
          routing: {
            collection_id: "project-1",
            collection_name: "Wiki Improvements",
            routing_source: "explicit_project",
            fallback: false,
          },
          created_at: "2026-05-25T00:00:00Z",
          updated_at: "2026-05-25T00:00:00Z",
        });
      }
      if (init.method === "PUT" && url.includes("/wiki/documents/")) {
        return jsonResponse({
          id: "doc-1",
          user_id: "user-1",
          collection_id: null,
          title: "Routing",
          content: "Body",
          metadata: {},
          status: "active",
          source: "openclaw",
          created_at: "2026-05-25T00:00:00Z",
          updated_at: "2026-05-25T00:00:00Z",
        });
      }
      return jsonResponse({});
    });

    const addResult = await tools[0]?.execute("call-1", {
      title: "Routing",
      content: "Body",
      project: "Wiki Improvements",
    });
    const updateResult = await tools[1]?.execute("call-2", {
      doc_id: "doc-1",
      project: "Wiki Improvements",
    });
    const clearResult = await tools[1]?.execute("call-3", {
      doc_id: "doc-1",
      project: null,
    });

    if (!addResult || !updateResult || !clearResult) {
      throw new Error("wiki tools were not registered");
    }
    expect(toolText(addResult)).toContain(
      'Wiki document created: "Routing" (ID: doc-1). Saved to Project: Wiki Improvements.',
    );
    expect(toolText(updateResult)).toContain(
      'Wiki document updated: "Routing" (ID: doc-1). Current destination: Basic.',
    );
    expect(toolText(clearResult)).toContain(
      'Wiki document updated: "Routing" (ID: doc-1). Moved to Basic.',
    );
  });

  test("delete wiki allows confirmed doc_id deletion without query", () => {
    const { api, tools } = makeApi();
    registerDeleteWikiTool(api, makeClient());
    const deleteTool = tools[0];
    expect(deleteTool?.name).toBe("membase_delete_wiki");
    expect(deleteTool?.parameters.required).toEqual([]);
  });
});

describe("current date helper", () => {
  test("current date output includes local and UTC values", () => {
    const now = new Date("2026-05-25T01:02:03.000Z");
    const text = buildCurrentDateText(now);
    expect(text).toContain("local_time:");
    expect(text).toContain(`local_date: ${localIsoString(now).slice(0, 10)}`);
    expect(text).toContain("utc_time: 2026-05-25T01:02:03.000Z");
    expect(text).toContain("utc_date: 2026-05-25");
  });
});
