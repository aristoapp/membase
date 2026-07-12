import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MembaseClient } from "./client";
import { registerCli } from "./commands/cli";
import { flushAllBuffers, registerCaptureHook } from "./hooks/capture";
import {
  flushCaptureSpool,
  getCaptureSpool,
  resetCaptureSpoolForTest,
} from "./spool";

// Failure-path spool end-to-end. spool.test.ts covers the spool primitives
// with a stub client; this drives the FULL client-side chain as shipped:
// an `agent_end` hook event → a wiki-transcript flush that fails against a
// down gateway → disk spool → the real `membase dream` CLI action → a real
// HTTP re-creation of the document once the gateway recovers. The one seam a
// network-only e2e (e2e/run-e2e.mjs) explicitly cannot cross — firing the hook
// and dream in-process — is exactly what this covers, against a fake gateway
// over the real MembaseClient.

let dataDir: string;
let prevEnv: string | undefined;
let server: Server;
let apiUrl = "";
let wikiBodies: string[] = [];
let gatewayDown = true;

function startGateway(): Promise<void> {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url?.includes("/wiki/documents")) {
        if (gatewayDown) {
          res.statusCode = 503;
          res.end("gateway down");
          return;
        }
        wikiBodies.push(body);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id: `doc_${wikiBodies.length}`,
            user_id: "u1",
            collection_id: null,
            title: "capture",
            content: "",
            metadata: {},
            status: "active",
            source: "openclaw",
            created_at: "2026-07-12T00:00:00Z",
            updated_at: "2026-07-12T00:00:00Z",
          }),
        );
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr !== "string") {
        apiUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "oc-dream-e2e-"));
  prevEnv = process.env.MEMBASE_DATA_DIR;
  process.env.MEMBASE_DATA_DIR = dataDir;
  wikiBodies = [];
  gatewayDown = true;
  resetCaptureSpoolForTest();
  await startGateway();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (prevEnv === undefined) delete process.env.MEMBASE_DATA_DIR;
  else process.env.MEMBASE_DATA_DIR = prevEnv;
  resetCaptureSpoolForTest();
  rmSync(dataDir, { recursive: true, force: true });
});

function authedClient(): MembaseClient {
  return new MembaseClient(apiUrl, {
    accessToken: "e2e-access-token",
    refreshToken: "",
    clientId: "e2e",
  });
}

// A minimal stand-in for the slice of OpenClawPluginApi the hook + CLI touch.
function makeApi() {
  const handlers: Record<
    string,
    (e: Record<string, unknown>) => Promise<void> | void
  > = {};
  const logs: string[] = [];
  let cliBuilder: ((ctx: { program: unknown }) => void) | null = null;
  const api = {
    logger: {
      info: (...a: unknown[]) => logs.push(`INFO ${a.join(" ")}`),
      warn: (...a: unknown[]) => logs.push(`WARN ${a.join(" ")}`),
      error: (...a: unknown[]) => logs.push(`ERR ${a.join(" ")}`),
      debug: () => {},
    },
    on: (
      event: string,
      h: (e: Record<string, unknown>) => Promise<void> | void,
    ) => {
      handlers[event] = h;
    },
    registerCli: (builder: (ctx: { program: unknown }) => void) => {
      cliBuilder = builder;
    },
  };
  return { api, handlers, logs, getCliBuilder: () => cliBuilder };
}

// A fake commander program that captures each command's action handler by name.
function makeProgram() {
  const actions: Record<string, () => Promise<void>> = {};
  const cmd = (path: string): any => ({
    description: () => cmd(path),
    option: () => cmd(path),
    command: (name: string) => cmd(name),
    action: (h: () => Promise<void>) => {
      actions[path] = h;
      return cmd(path);
    },
  });
  return { program: { command: (n: string) => cmd(n) }, actions };
}

// One agent_end event carries the whole last turn (user + assistant), which
// already clears MIN_MESSAGES_TO_FLUSH (2).
async function captureTurn(
  handlers: Record<string, (e: Record<string, unknown>) => Promise<void> | void>,
  userText: string,
  assistantText: string,
): Promise<void> {
  await handlers.agent_end({
    success: true,
    sessionKey: "e2e-channel",
    messages: [
      { role: "user", content: userText },
      { role: "assistant", content: assistantText },
    ],
  });
}

// Read every file under the spool dir and concatenate — used to assert what did
// (and didn't) reach disk.
function readAllUnder(dir: string): string {
  let out = "";
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    out += statSync(p).isDirectory() ? readAllUnder(p) : readFileSync(p, "utf-8");
  }
  return out;
}

describe("dream e2e (hook → spool → dream over a real client)", () => {
  test("failed flush spools to disk, then the real dream CLI uploads it", async () => {
    const { api, handlers, logs, getCliBuilder } = makeApi();
    const client = authedClient();
    registerCaptureHook(api, client, api.logger);

    const text =
      "Please remember: the deploy key rotation is scheduled for next Tuesday and the runbook lives in the ops wiki.";
    await captureTurn(handlers, text, "Noted — I'll track the rotation.");
    // Gateway is down — force the buffered turn to flush now (skip the 5-min
    // silence timer). The failing upload must land on disk, not in RAM.
    await flushAllBuffers(client, api.logger);

    expect(getCaptureSpool().pendingSpoolCount()).toBeGreaterThan(0);
    expect(wikiBodies.length).toBe(0);
    expect(logs.some((l) => l.includes("spooled to disk"))).toBe(true);

    // Gateway recovers; drive the actual `membase dream` action registered by
    // registerCli (not flushCaptureSpool directly).
    gatewayDown = false;
    registerCli(api, client);
    const { program, actions } = makeProgram();
    getCliBuilder()?.({ program });
    expect(actions.dream).toBeTruthy();

    await actions.dream();

    expect(wikiBodies.length).toBe(1);
    const body = JSON.parse(wikiBodies[0] ?? "{}");
    expect(body.content).toContain("deploy key rotation");
    expect(body.title).toContain("OpenClaw conversation capture");
    expect(body.source_metadata?.capture_kind).toBe("conversation_transcript");
    expect(getCaptureSpool().pendingSpoolCount()).toBe(0);
    expect(logs.some((l) => l.includes("Dream complete"))).toBe(true);
  });

  test("a captured secret is redacted before the batch reaches disk", async () => {
    const { api, handlers } = makeApi();
    const client = authedClient();
    registerCaptureHook(api, client, api.logger);

    // "dummy-" prefix keeps this fixture out of the secret-hygiene scanner while
    // still triggering capture-core redaction via the assignment shape.
    const secret = "dummy-SUPERSECRETVALUE1234567890";
    await captureTurn(
      handlers,
      `here is my OPENAI_API_KEY=${secret} and the deploy runbook context`,
      "I will not store the key itself, only the runbook context.",
    );
    await flushAllBuffers(client, api.logger);

    expect(getCaptureSpool().pendingSpoolCount()).toBeGreaterThan(0);
    const onDisk = readAllUnder(dataDir);
    expect(onDisk).not.toContain(secret);
    expect(onDisk).toContain("deploy runbook");
  });

  test("startup drain recovers a spooled capture after a restart", async () => {
    const { api, handlers } = makeApi();
    const client = authedClient();
    registerCaptureHook(api, client, api.logger);

    await captureTurn(
      handlers,
      "Remember the incident postmortem is due Friday and lives in the ops wiki.",
      "Understood — postmortem deadline noted.",
    );
    await flushAllBuffers(client, api.logger);
    expect(getCaptureSpool().pendingSpoolCount()).toBeGreaterThan(0);

    // Simulate a gateway restart: drop the in-process spool + RAM buffers but
    // keep the disk dir (same MEMBASE_DATA_DIR). This is index.ts's startup
    // drain: a fresh spool reads disk and flushCaptureSpool uploads it.
    resetCaptureSpoolForTest();
    gatewayDown = false;
    const { flushed, remaining } = await flushCaptureSpool(client);

    expect(flushed).toBe(1);
    expect(remaining).toBe(0);
    expect(wikiBodies.length).toBe(1);
    const body = JSON.parse(wikiBodies[0] ?? "{}");
    expect(body.content).toContain("incident postmortem");
  });
});
