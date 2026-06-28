export type MembaseVisibility = "private" | "team" | "public";

export const DEFAULT_MEMBASE_API_BASE_URL = "https://api.membase.com";

export const MEMBASE_CONNECTOR_ENV = {
  apiBaseUrl: "MEMBASE_API_BASE_URL",
  apiKey: "MEMBASE_API_KEY",
  profile: "MEMBASE_PROFILE"
} as const;

export type ConnectorEnvironment = Record<string, string | undefined>;

export interface ConnectorIdentity {
  id: string;
  displayName: string;
  version?: string;
}

export interface EndpointConfig {
  apiBaseUrl: string;
  timeoutMs: number;
  headers: Record<string, string>;
}

export interface AuthConfig {
  apiKeyEnv: string;
}

export interface ConnectorRuntimeConfig {
  client: ConnectorIdentity;
  endpoint: EndpointConfig;
  auth: AuthConfig;
  profile?: string;
}

export interface ConnectorConfigInput {
  client: ConnectorIdentity;
  apiBaseUrl?: string;
  apiKeyEnv?: string;
  profile?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface McpServerConfig {
  type?: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

export interface McpConfigDocument {
  mcpServers: Record<string, McpServerConfig>;
}

export interface MembaseProvenance {
  sourceSystem: string;
  sourceId?: string;
  url?: string;
  observedAt: string;
}

export interface RememberInput {
  content: string;
  visibility: MembaseVisibility;
  provenance: MembaseProvenance;
  tags?: string[];
}

export interface SearchInput {
  query: string;
  sourceFilters?: string[];
  freshness?: "latest" | "balanced" | "deep";
  limit?: number;
}

export interface ContextInput {
  task: string;
  files?: string[];
  userIntent?: string;
}

export interface ForgetInput {
  memoryId: string;
  reason: string;
}

export interface ConnectorClient {
  remember(input: RememberInput): Promise<{ id: string }>;
  search(input: SearchInput): Promise<Array<{ id: string; summary: string }>>;
  getContext(input: ContextInput): Promise<Array<{ id: string; summary: string }>>;
  deleteOrForget(input: ForgetInput): Promise<{ ok: boolean }>;
}

export type EnvReferenceStyle = "shell" | "cursor";

export interface McpConfigDocumentOptions {
  envReferenceStyle?: EnvReferenceStyle;
}

export function defineConnectorConfig(input: ConnectorConfigInput): ConnectorRuntimeConfig {
  const apiBaseUrl = normalizeBaseUrl(input.apiBaseUrl ?? DEFAULT_MEMBASE_API_BASE_URL);

  return {
    client: input.client,
    endpoint: {
      apiBaseUrl,
      timeoutMs: input.timeoutMs ?? 30_000,
      headers: input.headers ?? {}
    },
    auth: {
      apiKeyEnv: input.apiKeyEnv ?? MEMBASE_CONNECTOR_ENV.apiKey
    },
    profile: input.profile
  };
}

export function defineConnectorConfigFromEnv(
  client: ConnectorIdentity,
  env: ConnectorEnvironment
): ConnectorRuntimeConfig {
  return defineConnectorConfig({
    client,
    apiBaseUrl: env[MEMBASE_CONNECTOR_ENV.apiBaseUrl],
    profile: env[MEMBASE_CONNECTOR_ENV.profile]
  });
}

export function createMcpConfigDocument(
  serverName: string,
  runtime: ConnectorRuntimeConfig,
  server: Pick<McpServerConfig, "command" | "args" | "cwd" | "type">,
  options: McpConfigDocumentOptions = {}
): McpConfigDocument {
  return {
    mcpServers: {
      [serverName]: {
        ...(server.type ? { type: server.type } : {}),
        command: server.command,
        args: server.args,
        ...(server.cwd ? { cwd: server.cwd } : {}),
        env: createMcpEnvironment(runtime, options)
      }
    }
  };
}

export function createMcpEnvironment(
  runtime: ConnectorRuntimeConfig,
  options: McpConfigDocumentOptions = {}
): Record<string, string> {
  return removeUndefinedValues({
    [MEMBASE_CONNECTOR_ENV.apiBaseUrl]: runtime.endpoint.apiBaseUrl,
    [runtime.auth.apiKeyEnv]: formatEnvReference(runtime.auth.apiKeyEnv, options.envReferenceStyle),
    [MEMBASE_CONNECTOR_ENV.profile]: runtime.profile,
    MEMBASE_CLIENT_ID: runtime.client.id,
    MEMBASE_CLIENT_NAME: runtime.client.displayName,
    MEMBASE_CLIENT_VERSION: runtime.client.version
  });
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

  if (runtime.endpoint.timeoutMs <= 0) {
    errors.push("endpoint.timeoutMs must be positive");
  }

  if (!runtime.auth.apiKeyEnv.trim()) {
    errors.push("auth.apiKeyEnv is required");
  }

  return errors;
}

export function redactEnvironment(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      isSensitiveEnvKey(key) ? "[redacted]" : value
    ])
  );
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function removeUndefinedValues(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

function formatEnvReference(envName: string, style: EnvReferenceStyle = "shell"): string {
  if (style === "cursor") {
    return `\${env:${envName}}`;
  }

  return `\${${envName}}`;
}

function isSensitiveEnvKey(key: string): boolean {
  return /(?:API_)?KEY|TOKEN|SECRET|PASSWORD/i.test(key);
}
