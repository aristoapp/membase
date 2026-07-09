#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];

run("pnpm", ["--filter", "@membase/plugin-core", "build"]);

const {
  DEFAULT_MEMBASE_API_BASE_URL,
  createHttpMcpConfigDocument,
  createMcpConfigDocument,
  defineConnectorConfig,
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
  profile: "review-profile"
});

assert(runtime.endpoint.apiBaseUrl === "https://api.membase.test", "base URL should be normalized");
assert(runtime.profile === "review-profile", "profile should be preserved");

const defaultRuntime = defineConnectorConfig({ client });
assert(
  defaultRuntime.endpoint.apiBaseUrl === DEFAULT_MEMBASE_API_BASE_URL,
  "default API base URL mismatch"
);

const stdioConfig = createMcpConfigDocument("membase", {
  type: "stdio",
  command: "node",
  args: ["server.js"],
  cwd: "/tmp/membase-review",
  env: {
    STATIC_FLAG: "1"
  }
});
const stdioServer = stdioConfig.mcpServers.membase;
assert(stdioServer.type === "stdio", "stdio config should preserve type");
assert(stdioServer.command === "node", "stdio config should preserve command");
assert(stdioServer.args?.[0] === "server.js", "stdio config should preserve args");
assert(stdioServer.cwd === "/tmp/membase-review", "stdio config should preserve cwd");
assert(stdioServer.env.STATIC_FLAG === "1", "stdio config should preserve static env");
assert(
  Object.keys(stdioServer.env).length === 1,
  "stdio config env should contain only the explicit env passed in (OAuth-only auth: no key or client metadata is ever injected)"
);

const httpConfig = createHttpMcpConfigDocument("membase", {
  url: "https://mcp.membase.test/mcp"
});
const httpServer = httpConfig.mcpServers.membase;
assert(httpServer.url === "https://mcp.membase.test/mcp", "HTTP config URL mismatch");
assert(httpServer.headers === undefined, "HTTP config should omit headers when none are given");
assert(httpServer.command === undefined, "HTTP config should not include stdio command");
assert(httpServer.env === undefined, "HTTP config should not include local env");

const validationErrors = validateConnectorConfig({
  client: {
    id: "",
    displayName: ""
  },
  endpoint: {
    apiBaseUrl: "http://api.membase.test"
  }
});
assert(validationErrors.includes("client.id is required"), "missing client.id not reported");
assert(
  validationErrors.includes("client.displayName is required"),
  "missing client.displayName not reported"
);
assert(
  validationErrors.includes("endpoint.apiBaseUrl must use https"),
  "non-https base URL not reported"
);
assert(
  validateConnectorConfig(runtime).length === 0,
  "valid runtime config should produce no errors"
);

if (failures.length > 0) {
  console.error("Core contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Core contract check passed.");

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    failures.push(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}
