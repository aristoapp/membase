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

export const CODEX_CLIENT_ID = "codex";
export const CODEX_DISPLAY_NAME = "Codex CLI";
export const CODEX_MCP_SERVER_NAME = MEMBASE_MCP_SERVER_NAME;
export const CODEX_MCP_SERVER_URL = MEMBASE_MCP_SERVER_URL;
// Codex reads a plugin's MCP servers from a bundled config file referenced by
// the manifest's `mcpServers` field (OpenAI Codex `.codex-plugin` format).
export const CODEX_MCP_CONFIG_FILE = ".mcp.json";

export interface CodexPluginManifest {
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  homepage: string;
  repository: string;
  license: string;
  keywords: string[];
  // Path (relative to the plugin dir) to the bundled MCP server config.
  mcpServers: string;
}

export type CodexRuntimeConfigInput = McpHostAgentRuntimeConfigInput;

export interface CodexConnectorArtifacts {
  plugin: CodexPluginManifest;
  mcp: McpConfigDocument;
}

/** ADR 0003 descriptor — Codex is packaging data over the shared MCP host agent. */
export const codexAgent = defineMcpHostAgent({
  id: CODEX_CLIENT_ID,
  displayName: CODEX_DISPLAY_NAME,
  install: [
    {
      kind: "cli",
      command: "codex mcp add membase --url https://mcp.membase.so/mcp",
    },
    { kind: "config-file" },
  ],
  configFile: {
    path: "~/.codex/config.toml",
    format: "toml",
    key: "mcp_servers.membase",
  },
  manifest: {
    dir: ".codex-plugin",
    mcpConfigRef: CODEX_MCP_CONFIG_FILE,
    template: ({ version, mcpConfigRef }) => ({
      // Codex requires a kebab-case plugin name.
      name: "membase",
      version,
      description:
        "Connect Codex CLI to Membase context APIs for remember, search, task context, and forget actions.",
      author: { ...MEMBASE_PUBLISHER },
      homepage: MEMBASE_HOMEPAGE,
      repository: MEMBASE_REPOSITORY,
      license: "MIT",
      keywords: ["agent-memory", "context", "mcp", "codex", "membase"],
      mcpServers: mcpConfigRef,
    }),
  },
});

export function defineCodexRuntimeConfig(
  input: CodexRuntimeConfigInput = {},
): ConnectorRuntimeConfig {
  return codexAgent.defineRuntimeConfig(input);
}

export function generateCodexPluginManifest(
  config: ConnectorRuntimeConfig,
): CodexPluginManifest {
  return codexAgent.generateManifest(config) as unknown as CodexPluginManifest;
}

export function generateCodexMcpConfig(
  config: ConnectorRuntimeConfig,
): McpConfigDocument {
  return codexAgent.generateMcpConfig(config);
}

export function generateCodexArtifacts(
  config: ConnectorRuntimeConfig,
): CodexConnectorArtifacts {
  return {
    plugin: generateCodexPluginManifest(config),
    mcp: generateCodexMcpConfig(config),
  };
}

export const codexAdapter: ClientAdapter = codexAgent.adapter;
