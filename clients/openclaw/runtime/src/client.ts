import { MembaseTransport } from "@membase/capture-core";
import pkg from "../package.json" with { type: "json" };
import type {
  EpisodeBundle,
  Logger,
  WikiDocumentResponse,
  WikiSearchResponse,
} from "./types";
import { MembaseApiError } from "./types";
import { resolveWikiProjectInput } from "./wiki-project";

// Wiki writes can be slow server-side (capture transcripts are large and the
// backend summarizes/routes synchronously); 15s aborted legitimate uploads.
const DEFAULT_TIMEOUT_MS = 180_000;
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
// @membase/capture-core; this class keeps the
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
        `Membase API error (${status}): ${text.slice(0, 300)}`,
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

  async recordAgentUsage(): Promise<void> {
    try {
      await this.request("/agents/usage", {
        method: "POST",
        body: JSON.stringify({ source: "openclaw" }),
      });
    } catch {
      // Best-effort dashboard signal; never fail the user-facing tool result.
    }
  }

  async searchWiki(
    query: string,
    limit?: number,
    options?: {
      project?: string;
      collection?: string;
      collectionId?: string;
    },
  ): Promise<WikiSearchResponse> {
    const projectInput = resolveWikiProjectInput(options ?? {});
    if (projectInput.error) {
      throw new MembaseApiError(projectInput.error, 400);
    }
    const qs = new URLSearchParams({ query });
    if (limit !== undefined) qs.set("limit", String(limit));
    if (projectInput.value) qs.set("project", projectInput.value);
    if (options?.collectionId) qs.set("collection_id", options.collectionId);
    return this.request<WikiSearchResponse>(`/wiki/search?${qs.toString()}`);
  }

  async getKnownWikiProjects(): Promise<string[]> {
    return this.request<string[]>("/wiki/collections/known");
  }

  async createWikiDocument(
    title: string,
    content: string,
    options?: {
      project?: string;
      collection?: string;
      sourceMetadata?: Record<string, unknown>;
    },
  ): Promise<WikiDocumentResponse> {
    const projectInput = resolveWikiProjectInput(options ?? {});
    if (projectInput.error) {
      throw new MembaseApiError(projectInput.error, 400);
    }
    const body: Record<string, unknown> = {
      title,
      content,
      source: "openclaw",
      source_metadata: {
        ...(options?.sourceMetadata ?? {}),
        plugin_name: "openclaw-membase",
        plugin_version: pkg.version,
        host: "openclaw",
      },
    };
    if (projectInput.value) {
      body.project = projectInput.value;
    }
    return this.request<WikiDocumentResponse>("/wiki/documents", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateWikiDocument(
    docId: string,
    updates: {
      title?: string;
      content?: string;
      project?: string | null;
      collection?: string;
      collection_id?: null;
    },
  ): Promise<WikiDocumentResponse> {
    const projectInput = resolveWikiProjectInput(updates);
    if (projectInput.error) {
      throw new MembaseApiError(projectInput.error, 400);
    }
    // Whitelist the update body: only known fields go over the wire, and
    // `collection_id: null` (or project: null) means "move to Basic".
    const body: Record<string, unknown> = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.content !== undefined) body.content = updates.content;
    if (updates.collection_id === null || projectInput.value === null) {
      body.collection_id = null;
    } else if (projectInput.value !== undefined) {
      body.project = projectInput.value;
    }

    return this.request<WikiDocumentResponse>(`/wiki/documents/${docId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  async deleteWikiDocument(docId: string): Promise<void> {
    await this.requestNoContent(`/wiki/documents/${docId}`, {
      method: "DELETE",
    });
  }
}
