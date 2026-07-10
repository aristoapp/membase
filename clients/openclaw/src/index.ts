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

export const OPENCLAW_CLIENT_ID = "openclaw";
export const OPENCLAW_DISPLAY_NAME = "OpenClaw";
export const OPENCLAW_PLUGIN_ID = "openclaw-membase";
export const OPENCLAW_PLUGIN_KIND = "memory";
export const OPENCLAW_SKILLS_DIR = "skills";
export const OPENCLAW_MCP_SERVER_NAME = "membase";
export const OPENCLAW_MCP_SERVER_URL = "https://mcp.membase.so/mcp";

export interface OpenClawPluginManifest {
  id: string;
  kind: typeof OPENCLAW_PLUGIN_KIND;
  skills: string[];
  // Host tool allowlist: OpenClaw only exposes tools a manifest declares
  // under contracts.tools. Must stay identical to the runtime manifest's
  // list (clients/openclaw/runtime/openclaw.plugin.json) — the native-parity
  // guard cross-checks the two.
  contracts: { tools: string[] };
  uiHints: Record<string, OpenClawUiHint>;
  configSchema: OpenClawConfigSchema;
}

export const OPENCLAW_TOOL_CONTRACTS = [
  "membase_search",
  "membase_store",
  "membase_profile",
  "membase_forget",
  "membase_search_wiki",
  "membase_add_wiki",
  "membase_update_wiki",
  "membase_delete_wiki",
  "membase_handoff"
] as const;

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

export interface OpenClawExtensionRuntime {
  logger?: {
    info(message: string): void;
  };
}

export interface OpenClawNativeExtension {
  id: typeof OPENCLAW_PLUGIN_ID;
  kind: typeof OPENCLAW_PLUGIN_KIND;
  register(runtime?: OpenClawExtensionRuntime): void;
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
      version: version ?? "0.1.0"
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
    contracts: { tools: [...OPENCLAW_TOOL_CONTRACTS] },
    uiHints: {
      apiUrl: {
        label: "Membase API URL",
        placeholder: config.endpoint.apiBaseUrl,
        advanced: true
      },
      accessToken: {
        label: "OAuth Access Token",
        sensitive: true,
        advanced: true
      },
      refreshToken: {
        label: "OAuth Refresh Token",
        sensitive: true,
        advanced: true
      },
      clientId: {
        label: "OAuth Client ID",
        advanced: true
      },
      tokenFile: {
        label: "OAuth Token File",
        placeholder: "~/.openclaw/credentials/openclaw-membase.json",
        advanced: true
      },
      autoRecall: {
        label: "Auto-Recall",
        help: "Inject relevant memories before every AI turn (disabled by default)"
      },
      autoWikiRecall: {
        label: "Auto Wiki Recall",
        help: "Inject relevant wiki documents before every AI turn (disabled by default)"
      },
      autoCapture: {
        label: "Auto-Capture",
        help: "Automatically store conversations to memory"
      },
      maxRecallChars: {
        label: "Max Recall Context Size",
        placeholder: "4000",
        help: "Maximum characters of memory context injected per turn (500–16000)",
        advanced: true
      },
      debug: {
        label: "Debug Logging",
        help: "Enable verbose debug logs for API calls and responses",
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
        clientId: {
          type: "string"
        },
        tokenFile: {
          type: "string"
        },
        accessToken: {
          type: "string"
        },
        refreshToken: {
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
          default: true
        },
        maxRecallChars: {
          type: "number",
          minimum: 500,
          maximum: 16000
        },
        debug: {
          type: "boolean"
        }
      }
    }
  };
}

export function generateOpenClawMcpConfig(
  _config: ConnectorRuntimeConfig
): McpConfigDocument {
  return createHttpMcpConfigDocument(OPENCLAW_MCP_SERVER_NAME, {
    url: OPENCLAW_MCP_SERVER_URL,
    headers: {}
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

export const openClawNativeExtension: OpenClawNativeExtension = {
  id: OPENCLAW_PLUGIN_ID,
  kind: OPENCLAW_PLUGIN_KIND,
  register(runtime?: OpenClawExtensionRuntime): void {
    runtime?.logger?.info("Membase OpenClaw extension entrypoint loaded.");
  }
};

export default openClawNativeExtension;
