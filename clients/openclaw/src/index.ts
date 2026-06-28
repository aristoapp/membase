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

export const OPENCLAW_CLIENT_ID = "openclaw";
export const OPENCLAW_DISPLAY_NAME = "OpenClaw";
export const OPENCLAW_PLUGIN_ID = "openclaw-membase";
export const OPENCLAW_PLUGIN_KIND = "memory";
export const OPENCLAW_SKILLS_DIR = "skills";
export const OPENCLAW_MCP_SERVER_NAME = "membase";
export const OPENCLAW_MCP_SERVER_PACKAGE = "@membase/mcp-server";

export interface OpenClawPluginManifest {
  id: string;
  kind: typeof OPENCLAW_PLUGIN_KIND;
  skills: string[];
  uiHints: Record<string, OpenClawUiHint>;
  configSchema: OpenClawConfigSchema;
}

export interface OpenClawUiHint {
  label: string;
  placeholder?: string;
  help?: string;
  sensitive?: boolean;
  advanced?: boolean;
}

export interface OpenClawConfigSchema {
  type: "object";
  additionalProperties: false;
  properties: Record<string, OpenClawConfigPropertySchema>;
}

export interface OpenClawConfigPropertySchema {
  type: "string" | "boolean" | "number";
  default?: string | boolean | number;
  minimum?: number;
  maximum?: number;
}

export type OpenClawRuntimeConfigInput = Omit<ConnectorConfigInput, "client"> & {
  version?: string;
};

export interface OpenClawConnectorArtifacts {
  plugin: OpenClawPluginManifest;
  mcp: McpConfigDocument;
}

export function defineOpenClawRuntimeConfig(
  input: OpenClawRuntimeConfigInput = {}
): ConnectorRuntimeConfig {
  const { version, ...config } = input;

  return defineConnectorConfig({
    ...config,
    client: {
      id: OPENCLAW_CLIENT_ID,
      displayName: OPENCLAW_DISPLAY_NAME,
      version: version ?? "0.0.0"
    }
  });
}

export function generateOpenClawPluginManifest(
  config: ConnectorRuntimeConfig
): OpenClawPluginManifest {
  return {
    id: OPENCLAW_PLUGIN_ID,
    kind: OPENCLAW_PLUGIN_KIND,
    skills: [OPENCLAW_SKILLS_DIR],
    uiHints: {
      apiUrl: {
        label: "Membase API URL",
        placeholder: config.endpoint.apiBaseUrl,
        advanced: true
      },
      apiKeyEnv: {
        label: "API key environment variable",
        placeholder: config.auth.apiKeyEnv,
        help: "Name of the environment variable OpenClaw should read at runtime.",
        advanced: true
      },
      tokenFile: {
        label: "OAuth token file",
        placeholder: "~/.openclaw/credentials/openclaw-membase.json",
        help: "Native OpenClaw plugin token cache path for OAuth-based installs.",
        advanced: true
      },
      autoRecall: {
        label: "Auto-recall",
        help: "Inject relevant Membase context before an agent turn."
      },
      autoWikiRecall: {
        label: "Auto wiki recall",
        help: "Inject relevant wiki documents before an agent turn."
      },
      autoCapture: {
        label: "Auto-capture",
        help: "Store selected conversation context after an agent turn."
      },
      maxRecallChars: {
        label: "Max recall context size",
        placeholder: "4000",
        help: "Maximum context characters injected per turn.",
        advanced: true
      },
      debug: {
        label: "Debug logging",
        help: "Enable verbose connector diagnostics.",
        advanced: true
      }
    },
    configSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiUrl: {
          type: "string",
          default: config.endpoint.apiBaseUrl
        },
        apiKeyEnv: {
          type: "string",
          default: config.auth.apiKeyEnv
        },
        tokenFile: {
          type: "string"
        },
        autoRecall: {
          type: "boolean",
          default: false
        },
        autoWikiRecall: {
          type: "boolean",
          default: false
        },
        autoCapture: {
          type: "boolean",
          default: false
        },
        maxRecallChars: {
          type: "number",
          minimum: 500,
          maximum: 16000,
          default: 4000
        },
        debug: {
          type: "boolean",
          default: false
        }
      }
    }
  };
}

export function generateOpenClawMcpConfig(
  config: ConnectorRuntimeConfig
): McpConfigDocument {
  return createMcpConfigDocument(OPENCLAW_MCP_SERVER_NAME, config, {
    command: "npx",
    args: ["-y", OPENCLAW_MCP_SERVER_PACKAGE]
  });
}

export function generateOpenClawArtifacts(
  config: ConnectorRuntimeConfig
): OpenClawConnectorArtifacts {
  return {
    plugin: generateOpenClawPluginManifest(config),
    mcp: generateOpenClawMcpConfig(config)
  };
}

export const openClawAdapter: ClientAdapter = defineAdapter({
  id: OPENCLAW_CLIENT_ID,
  displayName: OPENCLAW_DISPLAY_NAME,
  generateManifest: generateOpenClawPluginManifest,
  generateMcpConfig: generateOpenClawMcpConfig,
  smokeTests(): SmokeTestCommand[] {
    return [
      {
        name: "openclaw-adapter-typecheck",
        command: ["pnpm", "--filter", "@membase/client-openclaw", "typecheck"]
      },
      {
        name: "public-surface-guard",
        command: ["pnpm", "public-surface"]
      }
    ];
  }
});
