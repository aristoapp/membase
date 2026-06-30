import {
  createHttpMcpConfigDocument,
  defineConnectorConfig,
  type ConnectorConfigInput,
  type ConnectorRuntimeConfig,
  type McpConfigDocument
} from "@membase/plugin-core";
import {
  defineAdapter,
  type ClientAdapter,
  type SmokeTestCommand
} from "@membase/connector-sdk";

export const CURSOR_CLIENT_ID = "cursor";
export const CURSOR_DISPLAY_NAME = "Cursor";
export const CURSOR_MCP_SERVER_NAME = "membase";
export const CURSOR_MCP_SERVER_URL = "https://mcp.membase.so/mcp";

export interface CursorPluginManifest {
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  homepage: string;
  repository: string;
  license: string;
  keywords: string[];
}

export type CursorRuntimeConfigInput = Omit<ConnectorConfigInput, "client"> & {
  version?: string;
};

export interface CursorConnectorArtifacts {
  plugin: CursorPluginManifest;
  mcp: McpConfigDocument;
}

export function defineCursorRuntimeConfig(
  input: CursorRuntimeConfigInput = {}
): ConnectorRuntimeConfig {
  const { version, ...config } = input;

  return defineConnectorConfig({
    ...config,
    client: {
      id: CURSOR_CLIENT_ID,
      displayName: CURSOR_DISPLAY_NAME,
      version: version ?? "0.0.0"
    }
  });
}

export function generateCursorPluginManifest(
  config: ConnectorRuntimeConfig
): CursorPluginManifest {
  return {
    name: "membase",
    displayName: "Membase",
    description:
      "Connect Cursor to Membase context APIs for remember, search, task context, and forget actions.",
    version: config.client.version ?? "0.0.0",
    author: {
      name: "Membase",
      email: "support@aristo.so",
      url: "https://membase.so"
    },
    homepage: "https://membase.so",
    repository: "https://github.com/aristoapp/membase-plugin-mcp",
    license: "MIT",
    keywords: [
      "agent-memory",
      "context",
      "mcp",
      "cursor",
      "membase"
    ]
  };
}

export function generateCursorMcpConfig(
  _config: ConnectorRuntimeConfig
): McpConfigDocument {
  return createHttpMcpConfigDocument(CURSOR_MCP_SERVER_NAME, {
    url: CURSOR_MCP_SERVER_URL,
    headers: {}
  });
}

export function generateCursorArtifacts(
  config: ConnectorRuntimeConfig
): CursorConnectorArtifacts {
  return {
    plugin: generateCursorPluginManifest(config),
    mcp: generateCursorMcpConfig(config)
  };
}

export const cursorAdapter: ClientAdapter = defineAdapter({
  id: CURSOR_CLIENT_ID,
  displayName: CURSOR_DISPLAY_NAME,
  generateManifest: generateCursorPluginManifest,
  generateMcpConfig: generateCursorMcpConfig,
  smokeTests(): SmokeTestCommand[] {
    return [
      {
        name: "cursor-adapter-typecheck",
        command: ["pnpm", "--filter", "@membase/client-cursor", "typecheck"]
      },
      {
        name: "public-surface-guard",
        command: ["pnpm", "public-surface"]
      }
    ];
  }
});
