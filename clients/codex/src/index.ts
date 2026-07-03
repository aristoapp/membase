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

export const CODEX_CLIENT_ID = "codex";
export const CODEX_DISPLAY_NAME = "Codex CLI";
export const CODEX_MCP_SERVER_NAME = "membase";
export const CODEX_MCP_SERVER_URL = "https://mcp.membase.so/mcp";
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

export type CodexRuntimeConfigInput = Omit<ConnectorConfigInput, "client"> & {
  version?: string;
};

export interface CodexConnectorArtifacts {
  plugin: CodexPluginManifest;
  mcp: McpConfigDocument;
}

export function defineCodexRuntimeConfig(
  input: CodexRuntimeConfigInput = {}
): ConnectorRuntimeConfig {
  const { version, ...config } = input;

  return defineConnectorConfig({
    ...config,
    client: {
      id: CODEX_CLIENT_ID,
      displayName: CODEX_DISPLAY_NAME,
      version: version ?? "0.0.0"
    }
  });
}

export function generateCodexPluginManifest(
  config: ConnectorRuntimeConfig
): CodexPluginManifest {
  return {
    // Codex requires a kebab-case plugin name.
    name: "membase",
    version: config.client.version ?? "0.0.0",
    description:
      "Connect Codex CLI to Membase context APIs for remember, search, task context, and forget actions.",
    author: {
      name: "Membase",
      email: "support@aristo.so",
      url: "https://membase.so"
    },
    homepage: "https://membase.so",
    repository: "https://github.com/aristoapp/membase-plugin-mcp",
    license: "MIT",
    keywords: ["agent-memory", "context", "mcp", "codex", "membase"],
    mcpServers: CODEX_MCP_CONFIG_FILE
  };
}

export function generateCodexMcpConfig(
  _config: ConnectorRuntimeConfig
): McpConfigDocument {
  // Codex supports remote streamable-HTTP MCP servers, so — like Cursor — the
  // connector points directly at the hosted endpoint (no local stdio bridge).
  return createHttpMcpConfigDocument(CODEX_MCP_SERVER_NAME, {
    url: CODEX_MCP_SERVER_URL,
    headers: {}
  });
}

export function generateCodexArtifacts(
  config: ConnectorRuntimeConfig
): CodexConnectorArtifacts {
  return {
    plugin: generateCodexPluginManifest(config),
    mcp: generateCodexMcpConfig(config)
  };
}

export const codexAdapter: ClientAdapter = defineAdapter({
  id: CODEX_CLIENT_ID,
  displayName: CODEX_DISPLAY_NAME,
  generateManifest: generateCodexPluginManifest,
  generateMcpConfig: generateCodexMcpConfig,
  smokeTests(): SmokeTestCommand[] {
    return [
      {
        name: "codex-adapter-typecheck",
        command: ["pnpm", "--filter", "@membase/client-codex", "typecheck"]
      },
      {
        name: "public-surface-guard",
        command: ["pnpm", "public-surface"]
      }
    ];
  }
});
