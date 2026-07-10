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
  `${CLAUDE_PLUGIN_ROOT_REFERENCE}/hooks/mcp-server.cjs`;

export interface ClaudePluginUserConfigEntry {
  type: "string" | "boolean" | "number";
  title: string;
  description: string;
  default: string | boolean | number;
  min?: number;
  max?: number;
}

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
  skills: string;
  commands: string;
  agents: string[];
  mcpServers: string;
  // No `hooks` field on purpose: Claude auto-discovers hooks/hooks.json, and
  // declaring it here too would load every hook twice.
  userConfig: Record<string, ClaudePluginUserConfigEntry>;
}

export type ClaudeRuntimeConfigInput = Omit<ConnectorConfigInput, "client"> & {
  version?: string;
};

export interface ClaudeMarketplaceManifest {
  name: string;
  owner: { name: string };
  plugins: Array<{
    name: string;
    source: string;
    description: string;
    version: string;
    author: { name: string; url: string };
    license: string;
    keywords: string[];
  }>;
}

export interface ClaudeConnectorArtifacts {
  plugin: ClaudePluginManifest;
  mcp: McpConfigDocument;
  marketplace: ClaudeMarketplaceManifest;
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
    ],
    skills: "./skills/",
    commands: "./commands/",
    agents: ["./agents/membase-curator.md"],
    mcpServers: "./.mcp.json",
    // Source of the CLAUDE_PLUGIN_OPTION_* env the stdio runtime reads;
    // defaults must match packages/stdio-runtime/src/config normalization.
    userConfig: {
      apiUrl: {
        type: "string",
        title: "Membase API URL",
        description: "Membase API endpoint.",
        default: "https://api.membase.so"
      },
      autoRecall: {
        type: "boolean",
        title: "Auto Recall",
        description:
          "Search Membase before user prompts and inject relevant context.",
        default: true
      },
      autoWikiRecall: {
        type: "boolean",
        title: "Auto Wiki Recall",
        description: "Include wiki documents in automatic recall.",
        default: false
      },
      maxRecallChars: {
        type: "number",
        title: "Max Recall Characters",
        description: "Maximum characters injected by auto-recall.",
        default: 4000,
        min: 500,
        max: 16000
      },
      sessionStartContext: {
        type: "string",
        title: "Session Start Context",
        description:
          "Context injected at Claude Code session start: off, minimal, or profile.",
        default: "minimal"
      },
      projectMode: {
        type: "string",
        title: "Project Mode",
        description: "Project scoping mode: auto_git, manual, or off.",
        default: "auto_git"
      },
      debug: {
        type: "boolean",
        title: "Debug Logging",
        description: "Write local debug logs under the plugin data directory.",
        default: false
      }
    }
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

// The repo root is the plugin payload, so the committed marketplace lists it
// at source "./" — `claude plugin marketplace add aristoapp/membase-plugin-mcp`
// works against the monorepo directly. The marketplace name stays
// "membase-plugins" (the aristoapp/claude-membase marketplace's name) so the
// enabledPlugins key `membase@membase-plugins` survives the repo transition.
export function generateClaudeMarketplace(
  config: ConnectorRuntimeConfig
): ClaudeMarketplaceManifest {
  const plugin = generateClaudePluginManifest(config);
  return {
    name: "membase-plugins",
    owner: { name: plugin.author.name },
    plugins: [
      {
        name: plugin.name,
        source: "./",
        description: plugin.description,
        version: plugin.version,
        author: { ...plugin.author },
        license: plugin.license,
        keywords: [...plugin.keywords]
      }
    ]
  };
}

export function generateClaudeArtifacts(
  config: ConnectorRuntimeConfig
): ClaudeConnectorArtifacts {
  return {
    plugin: generateClaudePluginManifest(config),
    mcp: generateClaudeMcpConfig(config),
    marketplace: generateClaudeMarketplace(config)
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
