// Transport (token state, single-flight refresh, retry-on-401) lives in
// @membase/capture-core (ADR 0002 / D1 slice 2); this class keeps the Claude
// product API surface, response parsing, and TokenState persistence shape.
import { MembaseTransport } from "@membase/capture-core";
import { MEMORY_SOURCE, USER_AGENT } from "../constants.js";
import type { EpisodeBundle, TokenState, WikiDocument } from "../types.js";
import { MembaseApiError } from "../types.js";

export interface ClientOptions {
  apiUrl: string;
  tokens: TokenState;
  timeoutMs?: number;
  onTokenRefresh?: (tokens: TokenState) => void;
}

export class MembaseClient {
  private tokens: TokenState;
  private readonly transport: MembaseTransport;

  constructor(options: ClientOptions) {
    this.tokens = options.tokens;
    this.transport = new MembaseTransport({
      apiUrl: options.apiUrl,
      tokens: {
        accessToken: options.tokens.accessToken,
        refreshToken: options.tokens.refreshToken,
        clientId: options.tokens.clientId,
        expiresAt: options.tokens.expiresAt,
        scope: options.tokens.scope,
      },
      userAgent: USER_AGENT,
      timeoutMs: options.timeoutMs,
      createError: (message, status, body) =>
        new MembaseApiError(message, status, body),
      onTokenRefresh: (tokens) => {
        this.tokens = {
          ...this.tokens,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scope: tokens.scope,
        };
        options.onTokenRefresh?.(this.tokens);
      },
    });
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await this.transport.authorizedFetch(path, options);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async searchMemory(args: {
    query: string;
    limit?: number;
    offset?: number;
    date_from?: string;
    date_to?: string;
    timezone?: string;
    sources?: string[];
    project?: string;
  }): Promise<EpisodeBundle[]> {
    const params = new URLSearchParams({
      query: args.query,
      limit: String(args.limit ?? 20),
      format: "bundles",
    });
    if (args.offset !== undefined) params.set("offset", String(args.offset));
    if (args.date_from) params.set("date_from", args.date_from);
    if (args.date_to) params.set("date_to", args.date_to);
    if (args.timezone) params.set("timezone", args.timezone);
    if (args.project) params.set("project", args.project);
    for (const source of args.sources ?? []) params.append("sources", source);
    const data = await this.request<{ episodes: EpisodeBundle[] }>(
      `/memory/search?${params.toString()}`,
    );
    return data.episodes ?? [];
  }

  async ingestMemory(args: {
    content: string;
    display_summary?: string;
    metadata?: Record<string, unknown>;
    project?: string;
  }): Promise<{ memory_id: string; revision_id: string; status: string }> {
    return this.request("/memory/ingest", {
      method: "POST",
      body: JSON.stringify({
        content: args.content,
        display_summary: args.display_summary,
        metadata: args.metadata,
        project: args.project,
        source: MEMORY_SOURCE,
        channel: "mcp",
      }),
    });
  }

  async getProfile(): Promise<Record<string, unknown>> {
    return this.request("/user/settings");
  }

  async getRecentMemories(limit = 10): Promise<EpisodeBundle[]> {
    return this.searchMemory({ query: "", limit });
  }

  async searchWiki(args: {
    query: string;
    limit?: number;
    collection?: string;
  }): Promise<WikiDocument[]> {
    const params = new URLSearchParams({
      query: args.query,
      limit: String(args.limit ?? 10),
    });
    if (args.collection) params.set("collection", args.collection);
    const data = await this.request<{ documents: WikiDocument[] }>(
      `/wiki/search?${params.toString()}`,
    );
    return data.documents ?? [];
  }

  async addWiki(args: {
    title: string;
    content: string;
    collection?: string;
    summarize?: boolean;
  }): Promise<WikiDocument> {
    return this.request("/wiki/documents", {
      method: "POST",
      body: JSON.stringify({
        title: args.title,
        content: args.content,
        collection: args.collection,
        summarize: args.summarize ?? false,
        source: MEMORY_SOURCE,
      }),
    });
  }

  async updateWiki(args: {
    doc_id: string;
    title?: string;
    content?: string;
    collection?: string;
  }): Promise<WikiDocument> {
    return this.request(`/wiki/documents/${args.doc_id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: args.title,
        content: args.content,
        collection: args.collection,
      }),
    });
  }

  async deleteWiki(docId: string): Promise<void> {
    await this.request(`/wiki/documents/${docId}`, { method: "DELETE" });
  }

  async registerConnection(): Promise<void> {
    await this.request("/agents/connect", {
      method: "POST",
      body: JSON.stringify({ source: MEMORY_SOURCE }),
    });
  }

  async recordUsage(): Promise<void> {
    await this.request("/agents/usage", {
      method: "POST",
      body: JSON.stringify({ source: MEMORY_SOURCE }),
    });
  }
}

export function createClient(
  apiUrl: string,
  tokens: TokenState,
  onTokenRefresh?: (tokens: TokenState) => void,
  options?: { timeoutMs?: number },
): MembaseClient {
  return new MembaseClient({
    apiUrl,
    tokens,
    onTokenRefresh,
    timeoutMs: options?.timeoutMs,
  });
}
