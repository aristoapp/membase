// Shared client-side capture/recall primitives (ADR 0002, Group D1).
//
// Everything here was byte-duplicated (or trivially diverged) across the
// Claude, OpenClaw, and Hermes runtimes. The core exports the shared
// primitives; host-specific behavior (extra strip patterns, keyword lists,
// empty-input policy) stays in each runtime as explicit parameters, so this
// extraction changes NO runtime behavior. Divergences that look accidental
// are documented at the parameter site and reconciled deliberately in D2.
//
// The language-neutral golden vectors in ../spec/sanitize-vectors.json bind
// this module and the Hermes Python port to the same semantics; both test
// suites consume the same file.

// ---------------------------------------------------------------------------
// Casual-chat detection (identical in all three runtimes)
// ---------------------------------------------------------------------------

// Callers lower-case input before matching, so patterns are case-sensitive.
export const CASUAL_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|yo|sup|hola|howdy|hiya|heya)\b/,
  /^(good\s*(morning|afternoon|evening|night))\b/,
  /^(thanks|thank you|thx|ty)\b/,
  /^(ok|okay|sure|got it|sounds good|cool|nice|great|awesome|perfect)\b/,
  /^(bye|goodbye|see you|later|gn|ttyl)\b/,
  /^(yes|no|yep|nope|yeah|nah)\b/,
  /^(lol|lmao|haha|heh)\b/,
  /^(how are you|what's up|whats up|wassup)\b/,
];

/**
 * True when the text is small-talk not worth remembering.
 *
 * `keywords` is the host's memory-keyword list (the runtimes deliberately
 * ship different lists today). `emptyIsCasual` preserves a live divergence:
 * Claude treats empty input as casual, OpenClaw/Hermes do not.
 */
export function isCasualChat(
  text: string,
  keywords: readonly string[],
  emptyIsCasual = false,
): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return emptyIsCasual;
  if (lower.includes("?") || keywords.some((kw) => lower.includes(kw))) {
    return false;
  }
  return CASUAL_PATTERNS.some((pattern) => pattern.test(lower));
}

// ---------------------------------------------------------------------------
// Block stripping (identical in all three runtimes)
// ---------------------------------------------------------------------------

export const MEMBASE_CONTEXT_BLOCK_RE =
  /<membase-context>[\s\S]*?<\/membase-context>\s*/gi;
export const MEMBASE_HANDOFF_BLOCK_RE =
  /<membase-handoff\b[^>]*>[\s\S]*?<\/membase-handoff>\s*/gi;
export const METADATA_BLOCK_RE =
  /(sender|conversation info)\s*\(untrusted metadata\):\s*(?:```json[\s\S]*?```|json\s*\{[\s\S]*?\})/gi;
export const SIMPLE_TAG_RE = /<\/?final>/gi;
export const CODE_BLOCK_RE = /```[\s\S]*?```/g;

/** Remove injected membase context/handoff, untrusted metadata blocks, and
 * tags — so harness-injected blocks aren't re-captured as memories. */
export function stripContextBlocks(text: string): string {
  return text
    .replace(MEMBASE_CONTEXT_BLOCK_RE, " ")
    .replace(MEMBASE_HANDOFF_BLOCK_RE, " ")
    .replace(METADATA_BLOCK_RE, " ")
    .replace(SIMPLE_TAG_RE, " ");
}

/** Trim lines, drop empties (and any line matching `dropLine`), rejoin. */
export function normalizeLines(
  text: string,
  dropLine?: (line: string) => boolean,
): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !(dropLine?.(line) ?? false))
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Secret redaction (the full rule set is the capture-path policy: Claude, and
// since E1/PR #12 the OpenClaw capture path too. Recall-query paths in
// OpenClaw/Hermes keep the basic assignment rule until D2.)
// ---------------------------------------------------------------------------

export const SECRET_ASSIGNMENT_KEYWORDS_FULL = [
  "API_KEY",
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "PRIVATE_KEY",
] as const;
export const SECRET_ASSIGNMENT_KEYWORDS_BASIC = [
  "API_KEY",
  "TOKEN",
  "SECRET",
  "PASSWORD",
] as const;

export function buildSecretAssignmentRe(
  keywords: readonly string[] = SECRET_ASSIGNMENT_KEYWORDS_FULL,
): RegExp {
  return new RegExp(
    `\\b([A-Z0-9_]*(?:${keywords.join("|")})[A-Z0-9_]*)\\s*=\\s*[^\\s\`]+`,
    "gi",
  );
}

// The default keyword set never varies, so build the assignment pattern once
// instead of per redactSecrets call (it runs per captured message at runtime).
const SECRET_ASSIGNMENT_FULL_RE = buildSecretAssignmentRe();

export const BEARER_TOKEN_RE = /\b(authorization:\s*bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
export const CLI_SECRET_FLAG_RE =
  /((?:^|\s)--(?:api-key|apikey|token|secret|password|pat|key)(?:=|\s+))[^\s`]+/gi;
export const COMMON_TOKEN_RE =
  /\b(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g;
export const PRIVATE_KEY_RE =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/** Apply the full redaction rule set (capture-path policy). */
export function redactSecrets(text: string): string {
  return text
    .replace(PRIVATE_KEY_RE, "[REDACTED_PRIVATE_KEY]")
    .replace(SECRET_ASSIGNMENT_FULL_RE, "$1=[REDACTED]")
    .replace(BEARER_TOKEN_RE, "$1[REDACTED]")
    .replace(CLI_SECRET_FLAG_RE, "$1[REDACTED]")
    .replace(COMMON_TOKEN_RE, "[REDACTED_TOKEN]");
}

function patternTest(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

/** True when text still smells like it carries a credential. */
export function looksSensitive(text: string): boolean {
  return (
    patternTest(SECRET_ASSIGNMENT_FULL_RE, text) ||
    patternTest(BEARER_TOKEN_RE, text) ||
    patternTest(CLI_SECRET_FLAG_RE, text) ||
    patternTest(COMMON_TOKEN_RE, text) ||
    patternTest(PRIVATE_KEY_RE, text) ||
    /\.env(\.|$|\s)/i.test(text)
  );
}

// ---------------------------------------------------------------------------
// Misc shared helpers
// ---------------------------------------------------------------------------

/** Collapse whitespace, strip code blocks, clamp for use as a search query. */
export function clampRecallQuery(sanitized: string, max = 240): string {
  return sanitized
    .replace(CODE_BLOCK_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function truncateText(
  value: string | null | undefined,
  max = 500,
): string {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}

export * from "./spool.js";
export * from "./token-store.js";
export * from "./handoff.js";

// ---------------------------------------------------------------------------
// OAuth HTTP transport (D1 slice 2)
//
// The token-state + single-flight-refresh + retry-on-401 machinery was
// byte-duplicated in the Claude and OpenClaw clients. Product API methods and
// response parsing stay in each runtime; only the transport lives here.
// Error TEXTS and the error CLASS are injected so each runtime keeps its
// exact messages and `instanceof MembaseApiError` semantics.
// ---------------------------------------------------------------------------

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  expiresAt?: number;
  scope?: string;
}

export interface TransportOptions {
  apiUrl: string;
  tokens: OAuthTokens;
  userAgent: string;
  timeoutMs?: number;
  onTokenRefresh?: (tokens: OAuthTokens) => void;
  log?: (message: string) => void;
  /** Construct the runtime's own error type (preserves instanceof checks). */
  createError: (message: string, status: number, body: string) => Error;
  notAuthenticatedMessage?: string;
  refreshFailedMessage?: (status: number) => string;
  apiErrorMessage?: (status: number, bodyText: string) => string;
}

export class MembaseTransport {
  private tokens: OAuthTokens;
  private refreshPromise: Promise<void> | null = null;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: TransportOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/$/, "");
    this.tokens = opts.tokens;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  get currentTokens(): OAuthTokens {
    return this.tokens;
  }

  isAuthenticated(): boolean {
    return Boolean(this.tokens.accessToken && this.tokens.clientId);
  }

  private rawFetch(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${this.apiUrl}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.tokens.accessToken}`,
        "User-Agent": this.opts.userAgent,
        ...(options.headers ?? {}),
      },
    });
  }

  private async doRefresh(): Promise<void> {
    if (!this.tokens.refreshToken || !this.tokens.clientId) {
      throw this.opts.createError(
        this.opts.notAuthenticatedMessage ?? "Not authenticated",
        401,
        "",
      );
    }
    this.opts.log?.("refreshing access token");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken,
      client_id: this.tokens.clientId,
    });
    const response = await fetch(`${this.apiUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.opts.userAgent,
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw this.opts.createError(
        this.opts.refreshFailedMessage?.(response.status) ??
          "Token refresh failed",
        response.status,
        text,
      );
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
    this.opts.log?.("token refreshed successfully");
    this.opts.onTokenRefresh?.(this.tokens);
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
  }

  /** Authenticated fetch with single-flight refresh and one retry on 401. */
  async authorizedFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    // Log the path only — query strings can carry user-derived recall text.
    this.opts.log?.(`${options.method ?? "GET"} ${path.split("?")[0]}`);
    let response = await this.rawFetch(path, options);
    if (response.status === 401 && this.tokens.refreshToken) {
      await response.body?.cancel();
      await this.refreshAccessToken();
      response = await this.rawFetch(path, options);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw this.opts.createError(
        this.opts.apiErrorMessage?.(response.status, text) ??
          `Membase API error ${response.status}`,
        response.status,
        text,
      );
    }
    return response;
  }
}
