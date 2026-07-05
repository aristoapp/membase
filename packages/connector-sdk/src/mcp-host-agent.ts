import {
  createHttpMcpConfigDocument,
  defineConnectorConfig,
  type ConnectorConfigInput,
  type ConnectorRuntimeConfig,
  type McpConfigDocument,
} from "@membase/plugin-core";
import type { ClientAdapter, SmokeTestCommand } from "./index.js";

/**
 * ADR 0003 — Agents are descriptors, not implementations.
 *
 * Every agent documented under docs.membase.so/connectors/agents/* connects
 * the same way: point an MCP host at the hosted Membase server and complete
 * OAuth. What varies per agent is pure packaging data. This module holds the
 * ONE implementation; each agent contributes only a descriptor.
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

/**
 * How a user registers Membase with the host. Derived from a full survey of
 * the ten documented agent pages (2026-07-05):
 *
 * - `cli`        — Claude Code/Desktop, Codex, Gemini CLI, OpenCode
 *                  (`npx -y membase@latest --client <id>` or a host CLI)
 * - `deeplink`   — Cursor, VS Code (one-click from the Membase dashboard)
 * - `ui-form`    — ChatGPT, Poke (hosted UI form; no local config file)
 * - `config-file`— manual merge into the host's MCP config file
 * - `manual-url` — Generic MCP URL (paste the server URL)
 */
export type InstallMethod =
  | { kind: "cli"; command: string }
  | { kind: "deeplink"; source: string }
  | { kind: "ui-form"; location: string; fields: Record<string, string> }
  | { kind: "config-file" }
  | { kind: "manual-url" };

export interface ManifestTemplateContext {
  version: string;
  /** Relative path to the bundled MCP config, when the manifest references one. */
  mcpConfigRef?: string;
}

export interface AgentConfigFile {
  /** User-facing path, e.g. "~/.codex/config.toml". */
  path: string;
  format: "json" | "toml";
  /** Key path of the Membase server entry, e.g. "mcp_servers.membase". */
  key: string;
}

export interface AgentManifestSpec {
  /** Manifest directory relative to the client package, e.g. ".codex-plugin". */
  dir: string;
  /** Manifest filename. Defaults to "plugin.json". */
  file?: string;
  /** Relative path the manifest's mcpServers field points at, if any. */
  mcpConfigRef?: string;
  /**
   * Declarative manifest template. Key order is preserved into the generated
   * JSON, so templates must list fields in the committed golden order.
   */
  template: (context: ManifestTemplateContext) => Record<string, unknown>;
}

export interface McpHostAgentDescriptor {
  /** Client id; matches docs.membase.so/connectors/agents/<docSlug ?? id>. */
  id: string;
  displayName: string;
  /** Docs slug when it differs from id (e.g. "mcp-url"). */
  docSlug?: string;
  /** Ordered by preference; first entry is the documented happy path. */
  install: InstallMethod[];
  /** The host's user-editable MCP config location, when one exists. */
  configFile?: AgentConfigFile;
  /** Plugin manifest packaging, for hosts with plugin/marketplace formats. */
  manifest?: AgentManifestSpec;
  /**
   * Static committed artifact dirs shipped alongside the descriptor
   * (relative to the client package), e.g. Cursor rules/skills/assets.
   */
  extras?: string[];
  /** Plan or account requirements, e.g. "ChatGPT Plus, Pro, or Team plan". */
  requirements?: string[];
  /** Steps after registration, e.g. "Restart Claude Desktop". */
  postInstall?: string[];
}

export type McpHostAgentRuntimeConfigInput = Omit<
  ConnectorConfigInput,
  "client"
> & {
  version?: string;
};

export interface McpHostAgentArtifacts {
  plugin?: Record<string, unknown>;
  mcp: McpConfigDocument;
}

export interface McpHostAgent {
  descriptor: McpHostAgentDescriptor;
  adapter: ClientAdapter;
  defineRuntimeConfig(
    input?: McpHostAgentRuntimeConfigInput,
  ): ConnectorRuntimeConfig;
  generateManifest(
    config: ConnectorRuntimeConfig,
  ): Record<string, unknown> | undefined;
  generateMcpConfig(config: ConnectorRuntimeConfig): McpConfigDocument;
  generateArtifacts(config: ConnectorRuntimeConfig): McpHostAgentArtifacts;
}

export function defineMcpHostAgent(
  descriptor: McpHostAgentDescriptor,
): McpHostAgent {
  const defineRuntimeConfig = (
    input: McpHostAgentRuntimeConfigInput = {},
  ): ConnectorRuntimeConfig => {
    const { version, ...config } = input;

    return defineConnectorConfig({
      ...config,
      client: {
        id: descriptor.id,
        displayName: descriptor.displayName,
        version: version ?? "0.0.0",
      },
    });
  };

  const generateManifest = (
    config: ConnectorRuntimeConfig,
  ): Record<string, unknown> | undefined => {
    if (!descriptor.manifest) {
      return undefined;
    }

    return descriptor.manifest.template({
      version: config.client.version ?? "0.0.0",
      mcpConfigRef: descriptor.manifest.mcpConfigRef,
    });
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

  const generateArtifacts = (
    config: ConnectorRuntimeConfig,
  ): McpHostAgentArtifacts => {
    const plugin = generateManifest(config);

    return {
      ...(plugin !== undefined ? { plugin } : {}),
      mcp: generateMcpConfig(config),
    };
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
    generateMcpConfig,
    generateArtifacts,
  };
}
