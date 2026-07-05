import type {
  ConnectorRuntimeConfig,
  McpConfigDocument,
} from "@membase/plugin-core";
import {
  MEMBASE_HOMEPAGE,
  MEMBASE_MCP_SERVER_NAME,
  MEMBASE_MCP_SERVER_URL,
  MEMBASE_PUBLISHER,
  MEMBASE_REPOSITORY,
  defineMcpHostAgent,
  type ClientAdapter,
  type McpHostAgentRuntimeConfigInput,
} from "@membase/connector-sdk";

export const CURSOR_CLIENT_ID = "cursor";
export const CURSOR_DISPLAY_NAME = "Cursor";
export const CURSOR_MCP_SERVER_NAME = MEMBASE_MCP_SERVER_NAME;
export const CURSOR_MCP_SERVER_URL = MEMBASE_MCP_SERVER_URL;

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

export type CursorRuntimeConfigInput = McpHostAgentRuntimeConfigInput;

export interface CursorConnectorArtifacts {
  plugin: CursorPluginManifest;
  mcp: McpConfigDocument;
}

/** ADR 0003 descriptor — Cursor is packaging data over the shared MCP host agent. */
export const cursorAgent = defineMcpHostAgent<CursorPluginManifest>({
  id: CURSOR_CLIENT_ID,
  displayName: CURSOR_DISPLAY_NAME,
  install: [
    { kind: "deeplink", source: "Membase dashboard → Add to Cursor" },
    { kind: "config-file" },
  ],
  configFile: {
    path: "~/.cursor/mcp.json",
    format: "json",
    key: "mcpServers.membase",
  },
  manifest: {
    dir: ".cursor-plugin",
    template: ({ version }) => ({
      name: "membase",
      displayName: "Membase",
      description:
        "Connect Cursor to Membase context APIs for remember, search, task context, and forget actions.",
      version,
      author: { ...MEMBASE_PUBLISHER },
      homepage: MEMBASE_HOMEPAGE,
      repository: MEMBASE_REPOSITORY,
      license: "MIT",
      keywords: ["agent-memory", "context", "mcp", "cursor", "membase"],
    }),
  },
  extras: ["rules", "skills", "assets"],
});

export function defineCursorRuntimeConfig(
  input: CursorRuntimeConfigInput = {},
): ConnectorRuntimeConfig {
  return cursorAgent.defineRuntimeConfig(input);
}

export function generateCursorPluginManifest(
  config: ConnectorRuntimeConfig,
): CursorPluginManifest {
  const manifest = cursorAgent.generateManifest(config);
  if (!manifest) {
    throw new Error("cursor descriptor declares no manifest template");
  }
  return manifest;
}

export function generateCursorMcpConfig(
  config: ConnectorRuntimeConfig,
): McpConfigDocument {
  return cursorAgent.generateMcpConfig(config);
}

export function generateCursorArtifacts(
  config: ConnectorRuntimeConfig,
): CursorConnectorArtifacts {
  return {
    plugin: generateCursorPluginManifest(config),
    mcp: generateCursorMcpConfig(config),
  };
}

export const cursorAdapter: ClientAdapter = cursorAgent.adapter;
