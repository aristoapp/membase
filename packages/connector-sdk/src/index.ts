import type {
  ConnectorRuntimeConfig,
  McpConfigDocument
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
