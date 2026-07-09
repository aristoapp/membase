export const DEFAULT_MEMBASE_API_BASE_URL = "https://api.membase.so";

export interface ConnectorIdentity {
  id: string;
  displayName: string;
  version?: string;
}

export interface EndpointConfig {
  apiBaseUrl: string;
}

export interface ConnectorRuntimeConfig {
  client: ConnectorIdentity;
  endpoint: EndpointConfig;
  profile?: string;
}

export interface ConnectorConfigInput {
  client: ConnectorIdentity;
  apiBaseUrl?: string;
  profile?: string;
}

export interface StdioMcpServerConfig {
  type?: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

export interface HttpMcpServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = StdioMcpServerConfig | HttpMcpServerConfig;

export interface McpConfigDocument {
  mcpServers: Record<string, McpServerConfig>;
}

export function defineConnectorConfig(input: ConnectorConfigInput): ConnectorRuntimeConfig {
  return {
    client: input.client,
    endpoint: {
      apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl ?? DEFAULT_MEMBASE_API_BASE_URL)
    },
    profile: input.profile
  };
}

export function createMcpConfigDocument(
  serverName: string,
  server: Pick<StdioMcpServerConfig, "command" | "args" | "cwd" | "type"> & {
    env?: Record<string, string>;
  }
): McpConfigDocument {
  // Stdio MCP config carries only the explicit env the client needs. Membase
  // clients authenticate via OAuth — no user-supplied API key exists, so no
  // key or client metadata is injected here. Remote clients use
  // createHttpMcpConfigDocument.
  return {
    mcpServers: {
      [serverName]: {
        ...(server.type ? { type: server.type } : {}),
        command: server.command,
        args: server.args,
        ...(server.cwd ? { cwd: server.cwd } : {}),
        env: server.env ?? {}
      }
    }
  };
}

export function createHttpMcpConfigDocument(
  serverName: string,
  server: HttpMcpServerConfig
): McpConfigDocument {
  return {
    mcpServers: {
      [serverName]: {
        url: server.url,
        ...(server.headers !== undefined ? { headers: server.headers } : {})
      }
    }
  };
}

export function validateConnectorConfig(runtime: ConnectorRuntimeConfig): string[] {
  const errors: string[] = [];

  if (!runtime.client.id.trim()) {
    errors.push("client.id is required");
  }

  if (!runtime.client.displayName.trim()) {
    errors.push("client.displayName is required");
  }

  if (!runtime.endpoint.apiBaseUrl.startsWith("https://")) {
    errors.push("endpoint.apiBaseUrl must use https");
  }

  return errors;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
