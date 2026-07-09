#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPublicContractStub } from "./public-contract-stub.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_SECRET = "membase-smoke-secret-do-not-print";
const SMOKE_API_BASE_URL = "https://api.membase.test";
const SMOKE_PROFILE = "client-smoke";

const executeCommands = process.argv.includes("--execute");

const clientSpecs = [
  {
    id: "claude",
    modulePath: "clients/claude/dist/index.js",
    adapterExport: "claudeAdapter",
    defineRuntimeConfigExport: "defineClaudeRuntimeConfig"
  },
  {
    id: "cursor",
    modulePath: "clients/cursor/dist/index.js",
    adapterExport: "cursorAdapter",
    defineRuntimeConfigExport: "defineCursorRuntimeConfig"
  },
  {
    id: "codex",
    modulePath: "clients/codex/dist/index.js",
    adapterExport: "codexAdapter",
    defineRuntimeConfigExport: "defineCodexRuntimeConfig"
  },
  {
    id: "hermes",
    modulePath: "clients/hermes/dist/index.js",
    adapterExport: "hermesAdapter",
    defineRuntimeConfigExport: "defineHermesRuntimeConfig"
  },
  {
    id: "openclaw",
    modulePath: "clients/openclaw/dist/index.js",
    adapterExport: "openClawAdapter",
    defineRuntimeConfigExport: "defineOpenClawRuntimeConfig"
  }
];

const { validateConnectorConfig } = await importModule("packages/core/dist/index.js");

let checkedClients = 0;
let declaredCommands = 0;

await verifyPublicContractStub();

for (const spec of clientSpecs) {
  const adapterModule = await importModule(spec.modulePath);
  const adapter = adapterModule[spec.adapterExport];
  const defineRuntimeConfig = adapterModule[spec.defineRuntimeConfigExport];

  assert(adapter, `${spec.modulePath} does not export ${spec.adapterExport}`);
  assert(
    typeof defineRuntimeConfig === "function",
    `${spec.modulePath} does not export ${spec.defineRuntimeConfigExport}`
  );
  assert(adapter.id === spec.id, `${spec.id} adapter id mismatch`);

  const runtime = defineRuntimeConfig({
    apiBaseUrl: SMOKE_API_BASE_URL,
    profile: SMOKE_PROFILE
  });
  const configErrors = validateConnectorConfig(runtime);
  assert(
    configErrors.length === 0,
    `${spec.id} runtime config failed validation: ${configErrors.join(", ")}`
  );

  verifyMcpConfig(spec.id, adapter.generateMcpConfig(runtime), runtime);
  const commands = verifyDeclaredSmokeCommands(spec.id, adapter.smokeTests(runtime));
  declaredCommands += commands.length;

  if (executeCommands) {
    runSmokeCommands(spec.id, commands);
  }

  checkedClients += 1;
}

console.log(
  `Client smoke harness passed (${checkedClients} clients, ${declaredCommands} declared commands, ${executeCommands ? "executed" : "dry-run"}).`
);

async function verifyPublicContractStub() {
  const client = createPublicContractStub();
  const sentinel = "client smoke sentinel";
  const remembered = await client.remember({
    content: `Membase ${sentinel}`,
    visibility: "private",
    provenance: {
      sourceSystem: "smoke",
      sourceId: "client-smoke",
      observedAt: "2026-06-28T00:00:00.000Z"
    },
    tags: ["smoke"]
  });

  assert(typeof remembered.id === "string", "remember did not return an id");

  const searchResults = await client.search({
    query: sentinel,
    limit: 5
  });
  assert(
    searchResults.some((result) => result.id === remembered.id),
    "search did not return the remembered item"
  );

  const contextResults = await client.getContext({
    task: "Validate Membase client smoke harness"
  });
  assert(
    contextResults.some((result) => result.id === remembered.id),
    "getContext did not return the remembered item"
  );

  const forgotten = await client.deleteOrForget({
    memoryId: remembered.id,
    reason: "smoke cleanup"
  });
  assert(forgotten.ok === true, "deleteOrForget did not confirm cleanup");

  const afterDeleteResults = await client.search({
    query: sentinel,
    limit: 5
  });
  assert(afterDeleteResults.length === 0, "deleteOrForget left stale search results");
}

// Finalized transport model: Claude uses a bundled stdio server with only a
// non-secret plugin flag; Cursor, Hermes, and OpenClaw use the remote HTTP MCP
// endpoint. No client carries a user-supplied API key or host in its config.
function verifyMcpConfig(clientId, mcpConfig, _runtime) {
  assert(mcpConfig && typeof mcpConfig === "object", `${clientId} MCP config missing`);
  assert(
    mcpConfig.mcpServers && typeof mcpConfig.mcpServers === "object",
    `${clientId} MCP config missing mcpServers`
  );

  const servers = Object.entries(mcpConfig.mcpServers);
  assert(servers.length === 1, `${clientId} should declare exactly one MCP server`);

  const [serverName, server] = servers[0];
  assert(serverName === "membase", `${clientId} MCP server should be named membase`);

  if (clientId === "claude") {
    verifyStdioMcpConfig(clientId, server);
  } else {
    verifyHttpMcpConfig(clientId, server);
  }

  assert(
    JSON.stringify(server).includes(FAKE_SECRET) === false,
    `${clientId} MCP config included a raw smoke secret`
  );
}

function verifyStdioMcpConfig(clientId, server) {
  assert(typeof server.command === "string" && server.command, `${clientId} MCP command missing`);
  assert(Array.isArray(server.args), `${clientId} MCP args must be an array`);
  assert(server.env && typeof server.env === "object", `${clientId} MCP env missing`);
  assert(server.url === undefined, `${clientId} stdio MCP config must not declare a remote url`);

  for (const [key, value] of Object.entries(server.env)) {
    if (isSensitiveKey(key)) {
      assert(
        isSafeSecretReference(value),
        `${clientId} MCP env contains a raw sensitive value for ${key}`
      );
    }
  }
  assert(
    server.env.MEMBASE_API_BASE_URL === undefined,
    `${clientId} MCP env should not embed a host`
  );
}

function verifyHttpMcpConfig(clientId, server) {
  assert(
    typeof server.url === "string" && server.url.startsWith("https://"),
    `${clientId} HTTP MCP config must declare an https url`
  );
  assert(
    server.url.includes("mcp.membase.so"),
    `${clientId} HTTP MCP config must point at the Membase MCP endpoint`
  );
  assert(
    server.headers && typeof server.headers === "object" && !Array.isArray(server.headers),
    `${clientId} HTTP MCP config must include a headers object`
  );
  assert(
    server.command === undefined && server.args === undefined,
    `${clientId} HTTP MCP config must not declare a stdio command`
  );
}

function verifyDeclaredSmokeCommands(clientId, commands) {
  assert(Array.isArray(commands), `${clientId} smokeTests must return an array`);
  assert(commands.length > 0, `${clientId} smokeTests must declare at least one command`);

  const seenNames = new Set();

  for (const command of commands) {
    assert(command && typeof command === "object", `${clientId} smoke command invalid`);
    assert(typeof command.name === "string" && command.name, `${clientId} smoke command missing name`);
    assert(!seenNames.has(command.name), `${clientId} duplicate smoke command ${command.name}`);
    seenNames.add(command.name);

    assert(Array.isArray(command.command), `${clientId}:${command.name} command must be an array`);
    assert(command.command.length > 0, `${clientId}:${command.name} command cannot be empty`);
    assert(
      command.command.every((part) => typeof part === "string" && part.length > 0),
      `${clientId}:${command.name} command parts must be non-empty strings`
    );

    const env = command.env ?? {};
    assert(env && typeof env === "object", `${clientId}:${command.name} env must be an object`);
    for (const [key, value] of Object.entries(env)) {
      if (isSensitiveKey(key)) {
        assert(
          isSafeSecretReference(value),
          `${clientId}:${command.name} contains a raw sensitive env value for ${key}`
        );
      }
    }
  }

  return commands;
}

function runSmokeCommands(clientId, commands) {
  for (const command of commands) {
    const [bin, ...args] = command.command;
    const result = spawnSync(bin, args, {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ...command.env,
        MEMBASE_API_KEY: process.env.MEMBASE_API_KEY ?? "smoke-placeholder-api-key"
      },
      stdio: "inherit"
    });

    assert(
      result.status === 0,
      `${clientId}:${command.name} exited with status ${result.status}`
    );
  }
}

async function importModule(relativePath) {
  try {
    return await import(pathToFileURL(path.join(ROOT_DIR, relativePath)).href);
  } catch (error) {
    throw new Error(
      `Unable to import ${relativePath}. Run pnpm typecheck first. ${error.message}`
    );
  }
}

function isSensitiveKey(key) {
  return /(?:API_)?KEY|TOKEN|SECRET|PASSWORD/i.test(key);
}

function isSafeSecretReference(value) {
  return typeof value === "string" && (
    value === "[redacted]" ||
    /^\$\{(?:env:)?[A-Z0-9_]+\}$/.test(value)
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
