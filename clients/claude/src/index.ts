import {
  createMcpConfigDocument,
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

export const CLAUDE_CLIENT_ID = "claude";
export const CLAUDE_DISPLAY_NAME = "Claude Code";
export const CLAUDE_MCP_SERVER_NAME = "membase";
export const CLAUDE_PLUGIN_ROOT_REFERENCE = "${CLAUDE_PLUGIN_ROOT}";
export const CLAUDE_PLUGIN_MCP_SERVER_PATH =
  `${CLAUDE_PLUGIN_ROOT_REFERENCE}/scripts/mcp-server.cjs`;

export interface ClaudePluginManifest {
  name: string;
  description: string;
  version: string;
  author: {
    name: string;
    url: string;
  };
  homepage: string;
  repository: string;
  license: string;
  keywords: string[];
}

export type ClaudeRuntimeConfigInput = Omit<ConnectorConfigInput, "client"> & {
  version?: string;
};

export interface ClaudeConnectorArtifacts {
  plugin: ClaudePluginManifest;
  mcp: McpConfigDocument;
}

export function defineClaudeRuntimeConfig(
  input: ClaudeRuntimeConfigInput = {}
): ConnectorRuntimeConfig {
  const { version, ...config } = input;

  return defineConnectorConfig({
    ...config,
    client: {
      id: CLAUDE_CLIENT_ID,
      displayName: CLAUDE_DISPLAY_NAME,
      version: version ?? "0.1.0"
    }
  });
}

export function generateClaudePluginManifest(
  config: ConnectorRuntimeConfig
): ClaudePluginManifest {
  return {
    name: "membase",
    description:
      "Connect Claude Code to Membase persistent memory over MCP — memory search and store, wiki, and session handoffs.",
    version: config.client.version ?? "0.1.0",
    author: {
      name: "Membase",
      url: "https://membase.so"
    },
    homepage: "https://membase.so",
    repository: "https://github.com/aristoapp/membase-plugin-mcp",
    license: "MIT",
    keywords: [
      "agent-memory",
      "context",
      "mcp",
      "claude-code",
      "membase"
    ]
  };
}

export function generateClaudeMcpConfig(
  _config: ConnectorRuntimeConfig
): McpConfigDocument {
  return createMcpConfigDocument(CLAUDE_MCP_SERVER_NAME, {
    command: "node",
    args: [CLAUDE_PLUGIN_MCP_SERVER_PATH],
    env: {
      MEMBASE_CLAUDE_PLUGIN: "1"
    }
  });
}

export function generateClaudeArtifacts(
  config: ConnectorRuntimeConfig
): ClaudeConnectorArtifacts {
  return {
    plugin: generateClaudePluginManifest(config),
    mcp: generateClaudeMcpConfig(config)
  };
}

export const claudeAdapter: ClientAdapter = defineAdapter({
  id: CLAUDE_CLIENT_ID,
  displayName: CLAUDE_DISPLAY_NAME,
  generateManifest: generateClaudePluginManifest,
  generateMcpConfig: generateClaudeMcpConfig,
  smokeTests(): SmokeTestCommand[] {
    return [
      {
        name: "claude-adapter-typecheck",
        command: ["pnpm", "--filter", "@membase/client-claude", "typecheck"]
      },
      {
        name: "public-surface-guard",
        command: ["pnpm", "public-surface"]
      }
    ];
  }
});
