import { MembaseTransport } from "@membase/capture-core";
import pkg from "../package.json" with { type: "json" };
import type {
  EpisodeBundle,
  Logger,
  WikiDocumentResponse,
  WikiSearchResponse,
} from "./types";
import { MembaseApiError } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = `membase-openclaw/${pkg.version}`;

export type TokenRefreshCallback = (tokens: {
  accessToken: string;
  refreshToken: string;
}) => void;

export interface MembaseClientOptions {
  onTokenRefresh?: TokenRefreshCallback;
  debug?: boolean;
  logger?: Logger;
  timeoutMs?: number;
}

// Transport (token state, single-flight refresh, retry-on-401) lives in
// @membase/capture-core (ADR 0002 / D1 slice 2); this class keeps the
// OpenClaw product API surface, text-first response parsing, and debug
// logging behavior.
export class MembaseClient {
  private readonly transport: MembaseTransport;
  private readonly debug: boolean;
  private readonly logger: Logger | null;

  constructor(
    apiUrl: string,
    auth: {
      accessToken: string;
      refreshToken: string;
      clientId: string;
    },
    opts?: MembaseClientOptions,
  ) {
    this.debug = opts?.debug ?? false;
    this.logger = opts?.logger ?? null;
    this.transport = new MembaseTransport({
      apiUrl,
      tokens: {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        clientId: auth.clientId,
      },
      userAgent: USER_AGENT,
      timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      log: (msg) => this.log(msg),
      createError: (message, status, body) =>
        new MembaseApiError(message, status, body),
      notAuthenticatedMessage:
        "Session expired. Run 'openclaw membase login' to re-authenticate.",
      refreshFailedMessage: (status) =>
        `Token refresh failed (${status}). Run 'openclaw membase login' to re-authenticate.`,
      apiErrorMessage: (status, text) =>
        `Membase API error (${status}): ${text}`,
      onTokenRefresh: (tokens) => {
        opts?.onTokenRefresh?.({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      },
    });
  }

  private log(msg: string, ...args: unknown[]) {
    if (this.debug && this.logger) {
      this.logger.info(`membase: ${msg}`, ...args);
    }
  }

  isAuthenticated(): boolean {
    return this.transport.isAuthenticated();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await this.authorizedFetch(path, options);
    const text = await response.text();
    this.log(`${path} → ${text.length} chars`);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new MembaseApiError(
        `Membase API returned non-JSON response: ${text.slice(0, 200)}`,
        response.status,
        text,
      );
    }
  }

  private async requestNoContent(
    path: string,
    options: RequestInit = {},
  ): Promise<void> {
    const response = await this.authorizedFetch(path, options);
    await response.body?.cancel();
  }

  private authorizedFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.transport.authorizedFetch(path, options);
  }

  async search(
    query: string,
    limit = 20,
    offset?: number,
    dateFrom?: string,
    dateTo?: string,
    timezone?: string,
    sources?: string[],
    project?: string,
  ): Promise<EpisodeBundle[]> {
    const qs = new URLSearchParams({
      query,
      limit: String(limit),
      format: "bundles",
    });
    if (offset !== undefined) qs.set("offset", String(offset));
    if (dateFrom) qs.set("date_from", dateFrom);
    if (dateTo) qs.set("date_to", dateTo);
    if (timezone) qs.set("timezone", timezone);
    if (sources && sources.length > 0) {
      for (const source of sources) {
        qs.append("sources", source);
      }
    }
    if (project?.trim()) qs.set("project", project.trim());
    const data = await this.request<{ episodes: EpisodeBundle[] }>(
      `/memory/search?${qs.toString()}`,
    );
    return data.episodes ?? [];
  }

  async ingest(
    content: string,
    opts?: { displaySummary?: string; project?: string },
  ): Promise<{ status: string }> {
    const body: Record<string, unknown> = {
      content,
      source: "openclaw",
      channel: "api",
    };
    if (opts?.displaySummary) {
      body.display_summary = opts.displaySummary;
    }
    if (opts?.project?.trim()) {
      body.project = opts.project.trim();
    }
    return this.request<{ status: string }>("/memory/ingest", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getProfile(): Promise<{
    display_name?: string | null;
    role?: string | null;
    interests?: string | null;
    instructions?: string | null;
  }> {
    return this.request("/user/settings");
  }

  async deleteMemory(uuid: string): Promise<void> {
    await this.requestNoContent(`/memory/episodes/${uuid}`, {
      method: "DELETE",
    });
  }

  async getUserProfileMemory(): Promise<EpisodeBundle | null> {
    try {
      const node = await this.request<Record<string, unknown>>(
        "/memory/user_profile",
      );
      if (node && typeof node === "object" && "uuid" in node) {
        return {
          episode: node as unknown as EpisodeBundle["episode"],
          edges: [],
        };
      }
      return null;
    } catch (error) {
      if (error instanceof MembaseApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async registerConnection(): Promise<void> {
    try {
      await this.request("/agents/connect", {
        method: "POST",
        body: JSON.stringify({ source: "openclaw" }),
      });
    } catch {
      // fire-and-forget: don't fail plugin startup for analytics
    }
  }

  async searchWiki(
    query: string,
    limit?: number,
    collection?: string,
    collectionId?: string,
  ): Promise<WikiSearchResponse> {
    const qs = new URLSearchParams({ query });
    if (limit !== undefined) qs.set("limit", String(limit));
    // The API distinguishes collection_id (UUID) from collection (name;
    // name filters are resolved by slug and lookup-or-create on write).
    if (collectionId) qs.set("collection_id", collectionId);
    else if (collection) qs.set("collection", collection);
    return this.request<WikiSearchResponse>(`/wiki/search?${qs.toString()}`);
  }

  async createWikiDocument(
    title: string,
    content: string,
    collection?: string,
    summarize?: boolean,
    collectionId?: string,
  ): Promise<WikiDocumentResponse> {
    const body: Record<string, unknown> = {
      title,
      content,
      source: "openclaw",
      summarize: summarize ?? false,
    };
    if (collection) {
      body.collection = collection;
    } else if (collectionId) {
      body.collection_id = collectionId;
    }
    return this.request<WikiDocumentResponse>("/wiki/documents", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateWikiDocument(
    docId: string,
    updates: { title?: string; content?: string; collection?: string },
  ): Promise<WikiDocumentResponse> {
    return this.request<WikiDocumentResponse>(`/wiki/documents/${docId}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async deleteWikiDocument(docId: string): Promise<void> {
    await this.requestNoContent(`/wiki/documents/${docId}`, {
      method: "DELETE",
    });
  }
}
