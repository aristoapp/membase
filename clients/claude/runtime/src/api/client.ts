import { MEMORY_SOURCE, USER_AGENT } from "../constants.js";
import type {
  EpisodeBundle,
  MembaseApiError as MembaseApiErrorType,
  TokenState,
  WikiDocument,
} from "../types.js";
import { MembaseApiError } from "../types.js";

export interface ClientOptions {
  apiUrl: string;
  tokens: TokenState;
  timeoutMs?: number;
  onTokenRefresh?: (tokens: TokenState) => void;
}

export class MembaseClient {
  private tokens: TokenState;
  private refreshPromise: Promise<void> | null = null;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly onTokenRefresh?: (tokens: TokenState) => void;

  constructor(options: ClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.tokens = options.tokens;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.onTokenRefresh = options.onTokenRefresh;
  }

  private async doRefresh(): Promise<void> {
    if (!this.tokens.refreshToken || !this.tokens.clientId) {
      throw new MembaseApiError("Not authenticated", 401);
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken,
      client_id: this.tokens.clientId,
    });
    const response = await fetch(`${this.apiUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new MembaseApiError("Token refresh failed", response.status, text);
    }
    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    this.tokens = {
      ...this.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: data.expires_in
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : undefined,
      scope: data.scope ?? this.tokens.scope,
    };
    this.onTokenRefresh?.(this.tokens);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
  }

  private async rawFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${this.apiUrl}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.tokens.accessToken}`,
        "User-Agent": USER_AGENT,
        ...(options.headers ?? {}),
      },
    });
  }

  private async authorizedFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    let response = await this.rawFetch(path, options);
    if (response.status === 401 && this.tokens.refreshToken) {
      await response.body?.cancel();
      await this.refreshAccessToken();
      response = await this.rawFetch(path, options);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new MembaseApiError(
        `Membase API error ${response.status}`,
        response.status,
        text,
      ) as MembaseApiErrorType;
    }
    return response;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await this.authorizedFetch(path, options);
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
