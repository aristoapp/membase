#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];

run("pnpm", ["--filter", "@membase/plugin-core", "build"]);

const {
  DEFAULT_MEMBASE_API_BASE_URL,
  MEMBASE_CONNECTOR_ENV,
  createHttpMcpConfigDocument,
  createMcpConfigDocument,
  createMcpEnvironment,
  defineConnectorConfig,
  defineConnectorConfigFromEnv,
  redactEnvironment,
  validateConnectorConfig
} = await import(pathToFileURL(path.join(ROOT_DIR, "packages/core/dist/index.js")).href);

const client = {
  id: "core-contract",
  displayName: "Core Contract",
  version: "1.2.3"
};

const runtime = defineConnectorConfig({
  client,
  apiBaseUrl: "https://api.membase.test/",
  apiKeyEnv: "CUSTOM_MEMBASE_KEY",
  profile: "review-profile",
  timeoutMs: 12_000,
  headers: {
    "x-review": "core"
  }
});

assert(runtime.endpoint.apiBaseUrl === "https://api.membase.test", "base URL should be normalized");
assert(runtime.endpoint.timeoutMs === 12_000, "timeout should be preserved");
assert(runtime.endpoint.headers["x-review"] === "core", "headers should be preserved");
assert(runtime.auth.apiKeyEnv === "CUSTOM_MEMBASE_KEY", "custom API key env should be preserved");
assert(runtime.profile === "review-profile", "profile should be preserved");

const defaultRuntime = defineConnectorConfig({ client });
assert(
  defaultRuntime.endpoint.apiBaseUrl === DEFAULT_MEMBASE_API_BASE_URL,
  "default API base URL mismatch"
);
assert(defaultRuntime.endpoint.timeoutMs === 30_000, "default timeout mismatch");
assert(
  defaultRuntime.auth.apiKeyEnv === MEMBASE_CONNECTOR_ENV.apiKey,
  "default API key env mismatch"
);

const envRuntime = defineConnectorConfigFromEnv(client, {
  MEMBASE_API_BASE_URL: "https://env.membase.test/",
  MEMBASE_PROFILE: "env-profile"
});
assert(envRuntime.endpoint.apiBaseUrl === "https://env.membase.test", "env base URL mismatch");
assert(envRuntime.profile === "env-profile", "env profile mismatch");

const shellEnv = createMcpEnvironment(runtime);
assert(shellEnv.MEMBASE_API_BASE_URL === "https://api.membase.test", "shell env missing API base URL");
assert(shellEnv.CUSTOM_MEMBASE_KEY === "${CUSTOM_MEMBASE_KEY}", "shell env API key reference mismatch");
assert(shellEnv.MEMBASE_PROFILE === "review-profile", "shell env missing profile");
assert(shellEnv.MEMBASE_CLIENT_ID === "core-contract", "shell env missing client id");
assert(shellEnv.MEMBASE_CLIENT_NAME === "Core Contract", "shell env missing client name");
assert(shellEnv.MEMBASE_CLIENT_VERSION === "1.2.3", "shell env missing client version");

const cursorEnv = createMcpEnvironment(runtime, { envReferenceStyle: "cursor" });
assert(
  cursorEnv.CUSTOM_MEMBASE_KEY === "${env:CUSTOM_MEMBASE_KEY}",
  "cursor env API key reference mismatch"
);

const stdioConfig = createMcpConfigDocument(
  "membase",
  runtime,
  {
    type: "stdio",
    command: "node",
    args: ["server.js"],
    cwd: "/tmp/membase-review",
    env: {
      STATIC_FLAG: "1"
    }
  }
);
const stdioServer = stdioConfig.mcpServers.membase;
assert(stdioServer.type === "stdio", "stdio config should preserve type");
assert(stdioServer.command === "node", "stdio config should preserve command");
assert(stdioServer.args?.[0] === "server.js", "stdio config should preserve args");
assert(stdioServer.cwd === "/tmp/membase-review", "stdio config should preserve cwd");
assert(stdioServer.env.STATIC_FLAG === "1", "stdio config should preserve static env");
assert(
  stdioServer.env.CUSTOM_MEMBASE_KEY === "${CUSTOM_MEMBASE_KEY}",
  "stdio config should use an API key reference"
);

const httpConfig = createHttpMcpConfigDocument("membase", {
  url: "https://mcp.membase.test/mcp",
  headers: {}
});
const httpServer = httpConfig.mcpServers.membase;
assert(httpServer.url === "https://mcp.membase.test/mcp", "HTTP config URL mismatch");
assert(httpServer.command === undefined, "HTTP config should not include stdio command");
assert(httpServer.env === undefined, "HTTP config should not include local env");

const redacted = redactEnvironment({
  CUSTOM_MEMBASE_KEY: "secret-value",
  MEMBASE_TOKEN: "token-value",
  PASSWORD: "password-value",
  MEMBASE_PROFILE: "review-profile"
});
const redactedText = JSON.stringify(redacted);
assert(!redactedText.includes("secret-value"), "redaction leaked API key");
assert(!redactedText.includes("token-value"), "redaction leaked token");
assert(!redactedText.includes("password-value"), "redaction leaked password");
assert(redacted.MEMBASE_PROFILE === "review-profile", "redaction should preserve non-sensitive values");

const validationErrors = validateConnectorConfig({
  client: {
    id: "",
    displayName: ""
  },
  endpoint: {
    apiBaseUrl: "http://api.membase.test",
    timeoutMs: 0,
    headers: {}
  },
  auth: {
    apiKeyEnv: ""
  }
});
assertIncludes(validationErrors, "client.id is required");
assertIncludes(validationErrors, "client.displayName is required");
assertIncludes(validationErrors, "endpoint.apiBaseUrl must use https");
assertIncludes(validationErrors, "endpoint.timeoutMs must be positive");
assertIncludes(validationErrors, "auth.apiKeyEnv is required");

if (failures.length > 0) {
  console.error("Core contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Core contract check passed.");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    failures.push(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function assertIncludes(values, expected) {
  assert(values.includes(expected), `validation errors should include ${JSON.stringify(expected)}`);
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}
