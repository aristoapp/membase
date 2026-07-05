import type {
  ConnectorRuntimeConfig,
  McpConfigDocument,
} from "@membase/plugin-core";

export interface SmokeTestCommand {
  name: string;
  command: string[];
  env?: Record<string, string>;
}

export interface ClientAdapter {
  id: string;
  displayName: string;
  generateManifest(config: ConnectorRuntimeConfig): unknown;
  generateMcpConfig(config: ConnectorRuntimeConfig): McpConfigDocument;
  smokeTests(config: ConnectorRuntimeConfig): SmokeTestCommand[];
}

export function defineAdapter(adapter: ClientAdapter): ClientAdapter {
  return adapter;
}

export {
  MEMBASE_HOMEPAGE,
  MEMBASE_MCP_SERVER_NAME,
  MEMBASE_MCP_SERVER_URL,
  MEMBASE_PUBLISHER,
  MEMBASE_REPOSITORY,
  defineMcpHostAgent,
  type AgentConfigFile,
  type AgentManifestSpec,
  type InstallMethod,
  type ManifestTemplateContext,
  type McpHostAgent,
  type McpHostAgentArtifacts,
  type McpHostAgentDescriptor,
  type McpHostAgentRuntimeConfigInput,
} from "./mcp-host-agent.js";
