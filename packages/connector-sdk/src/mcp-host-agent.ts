import {
  createHttpMcpConfigDocument,
  defineConnectorConfig,
  type ConnectorConfigInput,
  type ConnectorRuntimeConfig,
  type McpConfigDocument,
} from "@membase/plugin-core";
import type { ClientAdapter, SmokeTestCommand } from "./index.js";

/**
 * Agents are descriptors, not implementations.
 *
 * Every config-only MCP host connects the same way: point it at the hosted
 * Membase server and complete OAuth. What varies per agent is pure packaging
 * data. This module holds the ONE implementation; each agent contributes only
 * a descriptor.
 */

export const MEMBASE_MCP_SERVER_NAME = "membase";
export const MEMBASE_MCP_SERVER_URL = "https://mcp.membase.so/mcp";

/** Shared publisher blocks for descriptor manifest templates. */
export const MEMBASE_PUBLISHER = {
  name: "Membase",
  email: "support@aristo.so",
  url: "https://membase.so",
} as const;
export const MEMBASE_HOMEPAGE = "https://membase.so";
export const MEMBASE_REPOSITORY =
  "https://github.com/aristoapp/membase-plugin-mcp";

export interface ManifestTemplateContext {
  version: string;
}

export interface AgentManifestSpec<
  TManifest extends object = Record<string, unknown>,
> {
  /** Manifest directory relative to the client package, e.g. ".codex-plugin". */
  dir: string;
  /**
   * Declarative manifest template. Key order is preserved into the generated
   * JSON, so templates must list fields in the committed artifact's order —
   * the generated-artifacts check is what enforces this, byte-for-byte;
   * TypeScript only enforces the shape.
   */
  template: (context: ManifestTemplateContext) => TManifest;
}

export interface McpHostAgentDescriptor<
  TManifest extends object = Record<string, unknown>,
> {
  /** Client id, e.g. "cursor". */
  id: string;
  displayName: string;
  /** Plugin manifest packaging, for hosts with plugin/marketplace formats. */
  manifest?: AgentManifestSpec<TManifest>;
}

export type McpHostAgentRuntimeConfigInput = Omit<
  ConnectorConfigInput,
  "client"
> & {
  version?: string;
};

export interface McpHostAgent<
  TManifest extends object = Record<string, unknown>,
> {
  descriptor: McpHostAgentDescriptor<TManifest>;
  adapter: ClientAdapter;
  defineRuntimeConfig(
    input?: McpHostAgentRuntimeConfigInput,
  ): ConnectorRuntimeConfig;
  generateManifest(config: ConnectorRuntimeConfig): TManifest | undefined;
  /** Like generateManifest, but throws when the descriptor has no manifest. */
  generateRequiredManifest(config: ConnectorRuntimeConfig): TManifest;
  generateMcpConfig(config: ConnectorRuntimeConfig): McpConfigDocument;
}

export function defineMcpHostAgent<
  TManifest extends object = Record<string, unknown>,
>(descriptor: McpHostAgentDescriptor<TManifest>): McpHostAgent<TManifest> {
  const defineRuntimeConfig = (
    input: McpHostAgentRuntimeConfigInput = {},
  ): ConnectorRuntimeConfig => {
    const { version, ...config } = input;

    return defineConnectorConfig({
      ...config,
      client: {
        id: descriptor.id,
        displayName: descriptor.displayName,
        version: version ?? "0.1.0",
      },
    });
  };

  const generateManifest = (
    config: ConnectorRuntimeConfig,
  ): TManifest | undefined => {
    if (!descriptor.manifest) {
      return undefined;
    }

    return descriptor.manifest.template({
      version: config.client.version ?? "0.1.0",
    });
  };

  const generateRequiredManifest = (
    config: ConnectorRuntimeConfig,
  ): TManifest => {
    const manifest = generateManifest(config);
    if (!manifest) {
      throw new Error(
        `${descriptor.id} descriptor declares no manifest template`,
      );
    }
    return manifest;
  };

  const generateMcpConfig = (
    _config: ConnectorRuntimeConfig,
  ): McpConfigDocument => {
    // Every documented agent talks to the same hosted streamable-HTTP server
    // with OAuth; the config document is identical across agents.
    return createHttpMcpConfigDocument(MEMBASE_MCP_SERVER_NAME, {
      url: MEMBASE_MCP_SERVER_URL,
      headers: {},
    });
  };

  const adapter: ClientAdapter = {
    id: descriptor.id,
    displayName: descriptor.displayName,
    generateManifest,
    generateMcpConfig,
    smokeTests(): SmokeTestCommand[] {
      return [
        {
          name: `${descriptor.id}-adapter-typecheck`,
          command: [
            "pnpm",
            "--filter",
            `@membase/client-${descriptor.id}`,
            "typecheck",
          ],
        },
        {
          name: "public-surface-guard",
          command: ["pnpm", "public-surface"],
        },
      ];
    },
  };

  return {
    descriptor,
    adapter,
    defineRuntimeConfig,
    generateManifest,
    generateRequiredManifest,
    generateMcpConfig,
  };
}
