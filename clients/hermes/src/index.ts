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

export const HERMES_CLIENT_ID = "hermes";
export const HERMES_DISPLAY_NAME = "Hermes Agent";
export const HERMES_PLUGIN_NAME = "membase";
export const HERMES_PYTHON_PACKAGE = "hermes-membase";
export const HERMES_PYTHON_PACKAGE_MIN_VERSION = "0.2.0";
export const HERMES_MCP_SERVER_NAME = "membase";
export const HERMES_MCP_SERVER_URL = "https://mcp.membase.so/mcp";

export interface HermesPluginManifest {
  name: string;
  version: string;
  description: string;
  pip_dependencies: string[];
}

export type HermesRuntimeConfigInput = Omit<ConnectorConfigInput, "client"> & {
  version?: string;
};

export interface HermesConnectorArtifacts {
  plugin: HermesPluginManifest;
  mcp: McpConfigDocument;
}

export function defineHermesRuntimeConfig(
  input: HermesRuntimeConfigInput = {}
): ConnectorRuntimeConfig {
  const { version, ...config } = input;

  return defineConnectorConfig({
    ...config,
    client: {
      id: HERMES_CLIENT_ID,
      displayName: HERMES_DISPLAY_NAME,
      version: version ?? "0.0.0"
    }
  });
}

export function generateHermesPluginManifest(
  config: ConnectorRuntimeConfig
): HermesPluginManifest {
  return {
    name: HERMES_PLUGIN_NAME,
    version: config.client.version ?? "0.0.0",
    description:
      "Connect Hermes Agent to Membase context APIs for remember, search, task context, and forget actions.",
    pip_dependencies: [
      `${HERMES_PYTHON_PACKAGE}>=${HERMES_PYTHON_PACKAGE_MIN_VERSION}`
    ]
  };
}

export function generateHermesMcpConfig(
  _config: ConnectorRuntimeConfig
): McpConfigDocument {
  return createHttpMcpConfigDocument(HERMES_MCP_SERVER_NAME, {
    url: HERMES_MCP_SERVER_URL,
    headers: {}
  });
}

export function generateHermesArtifacts(
  config: ConnectorRuntimeConfig
): HermesConnectorArtifacts {
  return {
    plugin: generateHermesPluginManifest(config),
    mcp: generateHermesMcpConfig(config)
  };
}

export const hermesAdapter: ClientAdapter = defineAdapter({
  id: HERMES_CLIENT_ID,
  displayName: HERMES_DISPLAY_NAME,
  generateManifest: generateHermesPluginManifest,
  generateMcpConfig: generateHermesMcpConfig,
  smokeTests(): SmokeTestCommand[] {
    return [
      {
        name: "hermes-adapter-typecheck",
        command: ["pnpm", "--filter", "@membase/client-hermes", "typecheck"]
      },
      {
        name: "public-surface-guard",
        command: ["pnpm", "public-surface"]
      }
    ];
  }
});
