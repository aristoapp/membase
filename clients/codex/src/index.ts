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
  // Inline server config (not a file pointer): the Claude manifest inlines a
  // local stdio server, while Codex keeps the HTTP-first contract — every
  // manifest inlines its own config so one shared payload carries both.
  mcpServers: Record<string, { url: string; headers: Record<string, string> }>;
  // Committed interface metadata. Its presence also stops installer-side
  // enrichment (the plugins CLI synthesizes skills/mcpServers/interface into
  // manifests that lack `interface`, which would re-point mcpServers at the
  // Claude manifest's stdio config).
  interface: {
    displayName: string;
    shortDescription: string;
    developerName: string;
    websiteURL: string;
    category: string;
    capabilities: string[];
    logo: string;
    composerIcon: string;
  };
}

export type CodexRuntimeConfigInput = McpHostAgentRuntimeConfigInput;

export interface CodexConnectorArtifacts {
  plugin: CodexPluginManifest;
  mcp: McpConfigDocument;
}

/** Codex is packaging data over the shared MCP host agent. */
export const codexAgent = defineMcpHostAgent<CodexPluginManifest>({
  id: CODEX_CLIENT_ID,
  displayName: CODEX_DISPLAY_NAME,
  manifest: {
    dir: ".plugin",
    template: ({ version }) => ({
      // Codex requires a kebab-case plugin name.
      name: "membase",
      version,
      description:
        "Connect Codex CLI to Membase persistent memory over MCP — memory search and store, wiki, and session handoffs.",
      author: { ...MEMBASE_PUBLISHER },
      homepage: MEMBASE_HOMEPAGE,
      repository: MEMBASE_REPOSITORY,
      license: "MIT",
      keywords: ["agent-memory", "context", "mcp", "codex", "membase"],
      mcpServers: {
        [CODEX_MCP_SERVER_NAME]: { url: CODEX_MCP_SERVER_URL, headers: {} },
      },
      interface: {
        displayName: "Membase",
        shortDescription:
          "Persistent memory over MCP — memory search and store, wiki, and session handoffs.",
        developerName: "Membase",
        websiteURL: MEMBASE_HOMEPAGE,
        category: "Coding",
        capabilities: ["Interactive", "Write"],
        logo: "./assets/logo.svg",
        composerIcon: "./assets/logo.svg",
      },
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
  return codexAgent.generateRequiredManifest(config);
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
