#!/usr/bin/env node
"use strict";

// src/cli.ts
var import_node_fs5 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path5 = require("node:path");
var import_promises = require("node:readline/promises");

// ../../../packages/capture-core/src/spool.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var LOCK_STALE_MS = 3e4;
var LOCK_WAIT_MS = 2e3;
var INFLIGHT_STALE_MS = 6e4;
var SLEEP_BUFFER = new SharedArrayBuffer(4);
var SLEEP_VIEW = new Int32Array(SLEEP_BUFFER);
function sleepSync(ms) {
  Atomics.wait(SLEEP_VIEW, 0, 0, ms);
}
function hash(input) {
  return (0, import_node_crypto.createHash)("sha256").update(input).digest("hex");
}
function createCaptureSpool(options) {
  const minContentLength = options.minContentLength ?? 20;
  function spoolDir() {
    const dir = (0, import_node_path.join)(options.stateDir(), "spool");
    (0, import_node_fs.mkdirSync)(dir, { recursive: true, mode: 448 });
    return dir;
  }
  function spoolPath() {
    return (0, import_node_path.join)(spoolDir(), "pending.jsonl");
  }
  function sentPath() {
    return (0, import_node_path.join)(spoolDir(), "sent.json");
  }
  function lockPath() {
    return (0, import_node_path.join)(spoolDir(), ".lock");
  }
  function inflightPath() {
    return (0, import_node_path.join)(spoolDir(), `inflight-${process.pid}-${Date.now()}.jsonl`);
  }
  function acquireLock(timeoutMs = LOCK_WAIT_MS) {
    const path = lockPath();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const fd = (0, import_node_fs.openSync)(path, "wx", 384);
        return () => {
          try {
            (0, import_node_fs.closeSync)(fd);
          } catch {
          }
          try {
            (0, import_node_fs.rmSync)(path, { force: true });
          } catch {
          }
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          if (Date.now() - (0, import_node_fs.statSync)(path).mtimeMs > LOCK_STALE_MS) {
            (0, import_node_fs.rmSync)(path, { force: true });
            continue;
          }
        } catch {
        }
        sleepSync(25);
      }
    }
    throw new Error("Timed out waiting for Membase capture spool lock.");
  }
  function withSpoolLock(callback, timeoutMs = LOCK_WAIT_MS) {
    const release = acquireLock(timeoutMs);
    try {
      return callback();
    } finally {
      release();
    }
  }
  function captureId(args) {
    return hash(
      `${args.sessionId ?? "unknown"}:${args.captureKind}:${options.sanitize(
        args.content
      )}`
    );
  }
  function readRecordsFromPath(path) {
    if (!(0, import_node_fs.existsSync)(path)) return [];
    const raw = (0, import_node_fs.readFileSync)(path, "utf-8").trim();
    if (!raw) return [];
    return raw.split(/\r?\n/).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter((record) => Boolean(record));
  }
  function readRecords() {
    return readRecordsFromPath(spoolPath());
  }
  function writeRecordsToPath(path, records) {
    const tmp = `${path}.tmp`;
    (0, import_node_fs.writeFileSync)(
      tmp,
      records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""),
      { encoding: "utf-8", mode: 384 }
    );
    (0, import_node_fs.renameSync)(tmp, path);
  }
  function writeRecords(records) {
    writeRecordsToPath(spoolPath(), records);
  }
  function appendRecords(records) {
    if (records.length === 0) return;
    (0, import_node_fs.appendFileSync)(
      spoolPath(),
      `${records.map((record) => JSON.stringify(record)).join("\n")}
`,
      {
        encoding: "utf-8",
        mode: 384
      }
    );
  }
  function readSentIds() {
    const path = sentPath();
    if (!(0, import_node_fs.existsSync)(path)) return /* @__PURE__ */ new Set();
    try {
      const parsed = JSON.parse((0, import_node_fs.readFileSync)(path, "utf-8"));
      if (!Array.isArray(parsed)) return /* @__PURE__ */ new Set();
      return new Set(
        parsed.filter((value) => typeof value === "string")
      );
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function writeSentIds(ids) {
    const values = Array.from(ids).slice(-2e3);
    const path = sentPath();
    const tmp = `${path}.tmp`;
    (0, import_node_fs.writeFileSync)(tmp, `${JSON.stringify(values, null, 2)}
`, {
      encoding: "utf-8",
      mode: 384
    });
    (0, import_node_fs.renameSync)(tmp, path);
  }
  function inflightFiles() {
    return (0, import_node_fs.readdirSync)(spoolDir()).filter((name) => name.startsWith("inflight-") && name.endsWith(".jsonl")).map((name) => (0, import_node_path.join)(spoolDir(), name));
  }
  function readInflightRecords() {
    return inflightFiles().flatMap((path) => readRecordsFromPath(path));
  }
  function dedupeRecords(records, sentIds = readSentIds()) {
    const seen = /* @__PURE__ */ new Set();
    return records.filter((record) => {
      if (sentIds.has(record.capture_id) || seen.has(record.capture_id)) {
        return false;
      }
      seen.add(record.capture_id);
      return true;
    });
  }
  function appendPendingRecordsLocked(records) {
    const sentIds = readSentIds();
    const existingIds = new Set(
      readRecords().map((record) => record.capture_id)
    );
    const next = records.filter((record) => {
      if (sentIds.has(record.capture_id) || existingIds.has(record.capture_id)) {
        return false;
      }
      existingIds.add(record.capture_id);
      return true;
    });
    appendRecords(next);
  }
  function recoverStaleInflightLocked() {
    const now = Date.now();
    for (const path of inflightFiles()) {
      try {
        if (now - (0, import_node_fs.statSync)(path).mtimeMs < INFLIGHT_STALE_MS) continue;
        appendPendingRecordsLocked(readRecordsFromPath(path));
        (0, import_node_fs.rmSync)(path, { force: true });
      } catch {
      }
    }
  }
  function enqueueCapture(record) {
    const content = options.sanitize(record.content);
    if (!content || content.length < minContentLength) return null;
    const next = {
      capture_id: captureId({
        sessionId: record.sessionId,
        captureKind: record.capture_kind,
        content
      }),
      capture_kind: record.capture_kind,
      content,
      // Caller-supplied display_summary is raw hook/tool text — sanitize it
      // like content so secrets can't reach disk via the summary field.
      display_summary: record.display_summary ? options.sanitize(record.display_summary) : truncateText(content, 180),
      project: record.project,
      metadata: record.metadata,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      attempts: 0
    };
    try {
      return withSpoolLock(() => {
        recoverStaleInflightLocked();
        const existing = [...readRecords(), ...readInflightRecords()];
        if (existing.some((item) => item.capture_id === next.capture_id)) {
          return null;
        }
        if (readSentIds().has(next.capture_id)) return null;
        appendRecords([next]);
        return next;
      });
    } catch {
      return null;
    }
  }
  function pendingSpoolCount2() {
    return withSpoolLock(() => {
      recoverStaleInflightLocked();
      return readRecords().length;
    });
  }
  async function flushSpool2(send, limit = 10) {
    const drained = withSpoolLock(() => {
      recoverStaleInflightLocked();
      const sentIds = readSentIds();
      const records = dedupeRecords(readRecords(), sentIds);
      const batch = records.slice(0, limit);
      const pending = records.slice(limit);
      writeRecords(pending);
      const path = batch.length > 0 ? inflightPath() : void 0;
      if (path) writeRecordsToPath(path, batch);
      return { batch, path };
    });
    if (drained.batch.length === 0) {
      return { flushed: 0, remaining: pendingSpoolCount2() };
    }
    const failed = [];
    let flushed = 0;
    for (const record of drained.batch) {
      try {
        if (await send(record) === false) {
          throw new Error("uploader returned false");
        }
        withSpoolLock(() => {
          const sentIds = readSentIds();
          sentIds.add(record.capture_id);
          writeSentIds(sentIds);
        });
        flushed += 1;
      } catch (error) {
        failed.push({
          ...record,
          attempts: (record.attempts ?? 0) + 1,
          // Uploader errors can echo response bodies; sanitize and clamp
          // before persisting to disk.
          last_error: truncateText(
            options.sanitize(
              error instanceof Error ? error.message : String(error)
            ),
            300
          )
        });
      }
    }
    const remaining = withSpoolLock(() => {
      appendPendingRecordsLocked(failed);
      if (drained.path) (0, import_node_fs.rmSync)(drained.path, { force: true });
      return readRecords().length;
    });
    return { flushed, remaining };
  }
  return { captureId, enqueueCapture, flushSpool: flushSpool2, pendingSpoolCount: pendingSpoolCount2 };
}

// ../../../packages/capture-core/src/token-store.ts
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
function writeTextAtomic(path, text, mode = 384) {
  (0, import_node_fs2.mkdirSync)((0, import_node_path2.dirname)(path), { recursive: true, mode: 448 });
  const tmp = `${path}.tmp.${process.pid}`;
  (0, import_node_fs2.writeFileSync)(tmp, text, { encoding: "utf-8", mode });
  try {
    (0, import_node_fs2.renameSync)(tmp, path);
  } catch (err) {
    try {
      (0, import_node_fs2.rmSync)(tmp, { force: true });
    } catch {
    }
    throw err;
  }
  try {
    (0, import_node_fs2.chmodSync)(path, mode);
  } catch {
  }
}
function writeJsonAtomic(path, value, mode = 384) {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}
`, mode);
}
function createTokenStore(options) {
  const filename = options.filename ?? "credentials.json";
  function path() {
    return (0, import_node_path2.join)(options.dir(), filename);
  }
  function read() {
    const file = path();
    if (!(0, import_node_fs2.existsSync)(file)) return null;
    let obj;
    try {
      obj = JSON.parse((0, import_node_fs2.readFileSync)(file, "utf-8"));
    } catch {
      return null;
    }
    if (typeof obj !== "object" || obj === null) return null;
    if (typeof obj.clientId !== "string" || typeof obj.accessToken !== "string" || typeof obj.refreshToken !== "string") {
      return null;
    }
    return {
      clientId: obj.clientId,
      clientSecret: typeof obj.clientSecret === "string" ? obj.clientSecret : void 0,
      accessToken: obj.accessToken,
      refreshToken: obj.refreshToken,
      expiresAt: typeof obj.expiresAt === "number" ? obj.expiresAt : void 0,
      scope: typeof obj.scope === "string" ? obj.scope : void 0
    };
  }
  function write(tokens) {
    writeJsonAtomic(path(), tokens);
  }
  function clear() {
    try {
      (0, import_node_fs2.rmSync)(path(), { force: true });
    } catch {
    }
  }
  return { path, read, write, clear };
}

// ../../../packages/capture-core/src/handoff.ts
var HANDOFF_STALE_MS = 7 * 24 * 60 * 60 * 1e3;
function neutralizeInjection(text) {
  return text.replace(
    /<\/?(membase-[a-z-]+|system-reminder)\b/gi,
    (m) => `${m[0]}\u200B${m.slice(1)}`
  );
}

// ../../../packages/capture-core/src/index.ts
var MEMBASE_CONTEXT_BLOCK_RE = /<membase-context>[\s\S]*?<\/membase-context>\s*/gi;
var MEMBASE_HANDOFF_BLOCK_RE = /<membase-handoff\b[^>]*>[\s\S]*?<\/membase-handoff>\s*/gi;
var METADATA_BLOCK_RE = /(sender|conversation info)\s*\(untrusted metadata\):\s*(?:```json[\s\S]*?```|json\s*\{[\s\S]*?\})/gi;
var SIMPLE_TAG_RE = /<\/?final>/gi;
function stripContextBlocks(text) {
  return text.replace(MEMBASE_CONTEXT_BLOCK_RE, " ").replace(MEMBASE_HANDOFF_BLOCK_RE, " ").replace(METADATA_BLOCK_RE, " ").replace(SIMPLE_TAG_RE, " ");
}
function normalizeLines(text, dropLine) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !(dropLine?.(line) ?? false)).join("\n").trim();
}
var SECRET_ASSIGNMENT_KEYWORDS_FULL = [
  "API_KEY",
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "PRIVATE_KEY"
];
function buildSecretAssignmentRe(keywords = SECRET_ASSIGNMENT_KEYWORDS_FULL) {
  return new RegExp(
    `\\b([A-Z0-9_]*(?:${keywords.join("|")})[A-Z0-9_]*)\\s*=\\s*[^\\s\`]+`,
    "gi"
  );
}
var SECRET_ASSIGNMENT_FULL_RE = buildSecretAssignmentRe();
var BEARER_TOKEN_RE = /\b(authorization:\s*bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
var CLI_SECRET_FLAG_RE = /((?:^|\s)--(?:api-key|apikey|token|secret|password|pat|key)(?:=|\s+))[^\s`]+/gi;
var COMMON_TOKEN_RE = /\b(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g;
var PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
function redactSecrets(text) {
  return text.replace(PRIVATE_KEY_RE, "[REDACTED_PRIVATE_KEY]").replace(SECRET_ASSIGNMENT_FULL_RE, "$1=[REDACTED]").replace(BEARER_TOKEN_RE, "$1[REDACTED]").replace(CLI_SECRET_FLAG_RE, "$1[REDACTED]").replace(COMMON_TOKEN_RE, "[REDACTED_TOKEN]");
}
function patternTest(pattern, text) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}
function looksSensitive(text) {
  return patternTest(SECRET_ASSIGNMENT_FULL_RE, text) || patternTest(BEARER_TOKEN_RE, text) || patternTest(CLI_SECRET_FLAG_RE, text) || patternTest(COMMON_TOKEN_RE, text) || patternTest(PRIVATE_KEY_RE, text) || /\.env(\.|$|\s)/i.test(text);
}
function truncateText(value, max = 500) {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
}
var MembaseTransport = class {
  constructor(opts) {
    this.opts = opts;
    this.apiUrl = opts.apiUrl.replace(/\/$/, "");
    this.tokens = opts.tokens;
    this.timeoutMs = opts.timeoutMs ?? 15e3;
  }
  tokens;
  refreshPromise = null;
  apiUrl;
  timeoutMs;
  get currentTokens() {
    return this.tokens;
  }
  isAuthenticated() {
    return Boolean(this.tokens.accessToken && this.tokens.clientId);
  }
  rawFetch(path, options = {}) {
    return fetch(`${this.apiUrl}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.tokens.accessToken}`,
        "User-Agent": this.opts.userAgent,
        ...options.headers ?? {}
      }
    });
  }
  async doRefresh() {
    if (!this.tokens.refreshToken || !this.tokens.clientId) {
      throw this.opts.createError(
        this.opts.notAuthenticatedMessage ?? "Not authenticated",
        401,
        ""
      );
    }
    this.opts.log?.("refreshing access token");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken,
      client_id: this.tokens.clientId
    });
    const response = await fetch(`${this.apiUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this.opts.userAgent
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw this.opts.createError(
        this.opts.refreshFailedMessage?.(response.status) ?? "Token refresh failed",
        response.status,
        text
      );
    }
    const data = await response.json();
    this.tokens = {
      ...this.tokens,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: data.expires_in ? Math.floor(Date.now() / 1e3) + data.expires_in : void 0,
      scope: data.scope ?? this.tokens.scope
    };
    this.opts.log?.("token refreshed successfully");
    this.opts.onTokenRefresh?.(this.tokens);
  }
  async refreshAccessToken() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
  }
  /** Authenticated fetch with single-flight refresh and one retry on 401. */
  async authorizedFetch(path, options = {}) {
    this.opts.log?.(`${options.method ?? "GET"} ${path}`);
    let response = await this.rawFetch(path, options);
    if (response.status === 401 && this.tokens.refreshToken) {
      await response.body?.cancel();
      await this.refreshAccessToken();
      response = await this.rawFetch(path, options);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw this.opts.createError(
        this.opts.apiErrorMessage?.(response.status, text) ?? `Membase API error ${response.status}`,
        response.status,
        text
      );
    }
    return response;
  }
};

// src/constants.ts
var PLUGIN_NAME = "claude-membase";
var PLUGIN_VERSION = "0.1.4";
var DEFAULT_API_URL = "https://api.membase.so";
var DEFAULT_MCP_URL = "https://mcp.membase.so/mcp";
var RAW_CLIENT_SOURCE = process.env.MEMBASE_CLIENT_SOURCE;
var CLIENT_SOURCE = RAW_CLIENT_SOURCE && /^[a-z0-9-]{1,32}$/.test(RAW_CLIENT_SOURCE) ? RAW_CLIENT_SOURCE : "claude-code";
var MEMORY_SOURCE = CLIENT_SOURCE;
var USER_AGENT = `membase-${CLIENT_SOURCE}/${PLUGIN_VERSION}`;
var INGEST_PLUGIN_LABEL = CLIENT_SOURCE === "claude-code" ? PLUGIN_NAME : `membase-bundle-${CLIENT_SOURCE}`;
var CLIENT_LABELS = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor"
};
var CLIENT_LABEL = CLIENT_LABELS[CLIENT_SOURCE] ?? CLIENT_SOURCE;
var DEFAULT_MAX_RECALL_CHARS = 4e3;
var MAX_RECALL_CHARS = 16e3;
var MIN_RECALL_CHARS = 500;

// src/types.ts
var MembaseApiError = class extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "MembaseApiError";
  }
};

// src/api/client.ts
var MembaseClient = class {
  tokens;
  transport;
  constructor(options) {
    this.tokens = options.tokens;
    this.transport = new MembaseTransport({
      apiUrl: options.apiUrl,
      tokens: {
        accessToken: options.tokens.accessToken,
        refreshToken: options.tokens.refreshToken,
        clientId: options.tokens.clientId,
        expiresAt: options.tokens.expiresAt,
        scope: options.tokens.scope
      },
      userAgent: USER_AGENT,
      timeoutMs: options.timeoutMs,
      createError: (message, status, body) => new MembaseApiError(message, status, body),
      onTokenRefresh: (tokens) => {
        this.tokens = {
          ...this.tokens,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          scope: tokens.scope
        };
        options.onTokenRefresh?.(this.tokens);
      }
    });
  }
  async request(path, options = {}) {
    const response = await this.transport.authorizedFetch(path, options);
    if (response.status === 204) return void 0;
    return await response.json();
  }
  async searchMemory(args) {
    const params = new URLSearchParams({
      query: args.query,
      limit: String(args.limit ?? 20),
      format: "bundles"
    });
    if (args.offset !== void 0) params.set("offset", String(args.offset));
    if (args.date_from) params.set("date_from", args.date_from);
    if (args.date_to) params.set("date_to", args.date_to);
    if (args.timezone) params.set("timezone", args.timezone);
    if (args.project) params.set("project", args.project);
    for (const source of args.sources ?? []) params.append("sources", source);
    const data = await this.request(
      `/memory/search?${params.toString()}`
    );
    return data.episodes ?? [];
  }
  async ingestMemory(args) {
    return this.request("/memory/ingest", {
      method: "POST",
      body: JSON.stringify({
        content: args.content,
        display_summary: args.display_summary,
        metadata: args.metadata,
        project: args.project,
        source: MEMORY_SOURCE,
        channel: "mcp"
      })
    });
  }
  async getProfile() {
    return this.request("/user/settings");
  }
  async getRecentMemories(limit = 10) {
    return this.searchMemory({ query: "", limit });
  }
  async searchWiki(args) {
    const params = new URLSearchParams({
      query: args.query,
      limit: String(args.limit ?? 10)
    });
    if (args.collection) params.set("collection", args.collection);
    const data = await this.request(
      `/wiki/search?${params.toString()}`
    );
    return data.documents ?? [];
  }
  async addWiki(args) {
    return this.request("/wiki/documents", {
      method: "POST",
      body: JSON.stringify({
        title: args.title,
        content: args.content,
        collection: args.collection,
        summarize: args.summarize ?? false,
        source: MEMORY_SOURCE
      })
    });
  }
  async updateWiki(args) {
    return this.request(`/wiki/documents/${args.doc_id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: args.title,
        content: args.content,
        collection: args.collection
      })
    });
  }
  async deleteEpisode(uuid) {
    await this.request(`/memory/episodes/${encodeURIComponent(uuid)}`, {
      method: "DELETE"
    });
  }
  async deleteWiki(docId) {
    await this.request(`/wiki/documents/${docId}`, { method: "DELETE" });
  }
  async registerConnection() {
    await this.request("/agents/connect", {
      method: "POST",
      body: JSON.stringify({ source: MEMORY_SOURCE })
    });
  }
  async recordUsage() {
    await this.request("/agents/usage", {
      method: "POST",
      body: JSON.stringify({ source: MEMORY_SOURCE })
    });
  }
};
function createClient(apiUrl, tokens, onTokenRefresh, options) {
  return new MembaseClient({
    apiUrl,
    tokens,
    onTokenRefresh,
    timeoutMs: options?.timeoutMs
  });
}

// src/auth/oauth.ts
var import_node_crypto2 = require("node:crypto");
var import_node_http = require("node:http");
var import_node_child_process = require("node:child_process");
var CALLBACK_TIMEOUT_MS = 5 * 60 * 1e3;
function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function spawnDetached(command, args) {
  const child = (0, import_node_child_process.spawn)(command, args, { detached: true, stdio: "ignore" });
  child.once("error", () => void 0);
  child.unref();
}
function browserLaunchCommand(url, platform = process.platform) {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") {
    return {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url]
    };
  }
  return { command: "xdg-open", args: [url] };
}
function openBrowser(url) {
  try {
    const launch = browserLaunchCommand(url);
    spawnDetached(launch.command, launch.args);
  } catch {
  }
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}
async function registerClient(apiUrl, redirectUri) {
  const response = await fetch(`${apiUrl}/oauth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify({
      client_name: "Membase Claude Code Plugin",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    }),
    signal: AbortSignal.timeout(3e4)
  });
  if (!response.ok) {
    throw new Error(`OAuth client registration failed: ${response.status}`);
  }
  return await response.json();
}
function listenForCallback() {
  return new Promise((resolve2, reject) => {
    const server = (0, import_node_http.createServer)((req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found.");
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? void 0;
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing OAuth code.");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Membase connected</h1><p>You can return to Claude Code.</p></body></html>"
        );
        server.emit("membase-code", { code, state });
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(error));
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate OAuth callback port"));
        return;
      }
      const codePromise = new Promise(
        (res) => {
          server.once(
            "membase-code",
            (payload) => res(payload)
          );
        }
      );
      resolve2({
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        codePromise,
        close: () => {
          try {
            server.close();
          } catch {
          }
        }
      });
    });
  });
}
async function loginWithOAuth(apiUrl) {
  const callback = await listenForCallback();
  try {
    const verifier = base64Url((0, import_node_crypto2.randomBytes)(32));
    const challenge = base64Url((0, import_node_crypto2.createHash)("sha256").update(verifier).digest());
    const state = base64Url((0, import_node_crypto2.randomBytes)(16));
    const client = await registerClient(apiUrl, callback.redirectUri);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: callback.redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      mcp_source: MEMORY_SOURCE
    });
    const authorizeUrl = `${apiUrl}/oauth/authorize?${params.toString()}`;
    openBrowser(authorizeUrl);
    console.error(`If the browser did not open, visit:
${authorizeUrl}`);
    const { code, state: returnedState } = await withTimeout(
      callback.codePromise,
      CALLBACK_TIMEOUT_MS,
      "OAuth login timed out before the browser callback completed."
    );
    if (returnedState !== state) {
      throw new Error("OAuth state mismatch");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callback.redirectUri,
      client_id: client.client_id,
      code_verifier: verifier
    });
    if (client.client_secret) body.set("client_secret", client.client_secret);
    const response = await fetch(`${apiUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT
      },
      body,
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OAuth token exchange failed: ${response.status} ${text}`
      );
    }
    const data = await response.json();
    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Math.floor(Date.now() / 1e3) + data.expires_in : void 0,
      scope: data.scope
    };
  } finally {
    callback.close();
  }
}

// src/config/index.ts
var import_node_fs3 = require("node:fs");
var import_node_os = require("node:os");
var import_node_path3 = require("node:path");
function getDataDir() {
  const dir = (
    // Client-neutral override first: stdio-bundled clients (Cursor/Codex)
    // point this at their own state dir — or a shared one for a single
    // machine-wide login — without Claude-specific env names.
    process.env.MEMBASE_DATA_DIR || process.env.CLAUDE_PLUGIN_DATA || (0, import_node_path3.join)((0, import_node_os.homedir)(), ".claude", "plugins", "membase")
  );
  return dir.startsWith("~/") ? (0, import_node_path3.join)((0, import_node_os.homedir)(), dir.slice(2)) : dir;
}
function ensureDataDir() {
  const dir = getDataDir();
  (0, import_node_fs3.mkdirSync)(dir, { recursive: true, mode: 448 });
  try {
    (0, import_node_fs3.chmodSync)(dir, 448);
  } catch {
  }
  return dir;
}
function configPath() {
  return (0, import_node_path3.join)(ensureDataDir(), "config.json");
}
var tokenStore = createTokenStore({ dir: ensureDataDir });
function readJsonObject(path) {
  try {
    return JSON.parse((0, import_node_fs3.readFileSync)(path, "utf-8"));
  } catch {
    return {};
  }
}
function pluginOption(name) {
  return process.env[`CLAUDE_PLUGIN_OPTION_${name}`] ?? process.env[`CLAUDE_PLUGIN_OPTION_${name.toUpperCase()}`];
}
function boolFromOption(name, fallback) {
  const value = pluginOption(name);
  if (value === void 0) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
function strFromOption(name) {
  const value = pluginOption(name);
  return value?.trim() ? value.trim() : void 0;
}
function numberFromOption(name) {
  const value = pluginOption(name);
  if (!value) return void 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function normalizeCaptureMode(value) {
  return value === "summary" ? "summary" : "off";
}
function normalizeProjectMode(value) {
  if (value === "manual" || value === "off") return value;
  return "auto_git";
}
function normalizeSessionStartContext(value) {
  if (value === "off" || value === "profile") return value;
  return "minimal";
}
function clampRecallChars(value) {
  const raw = typeof value === "number" ? value : DEFAULT_MAX_RECALL_CHARS;
  return Math.max(MIN_RECALL_CHARS, Math.min(MAX_RECALL_CHARS, raw));
}
function loadConfig() {
  const disk = readJsonObject(configPath());
  const apiUrl = strFromOption("apiUrl") || (typeof disk.apiUrl === "string" ? disk.apiUrl : "") || DEFAULT_API_URL;
  const maxRecallChars = numberFromOption("maxRecallChars") ?? (typeof disk.maxRecallChars === "number" ? disk.maxRecallChars : DEFAULT_MAX_RECALL_CHARS);
  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    autoRecall: boolFromOption(
      "autoRecall",
      typeof disk.autoRecall === "boolean" ? disk.autoRecall : true
    ),
    autoWikiRecall: boolFromOption(
      "autoWikiRecall",
      typeof disk.autoWikiRecall === "boolean" ? disk.autoWikiRecall : false
    ),
    // Disk wins: hooks pass a captureMode option on every run, so env can
    // only be the default — otherwise it would override an explicit opt-out.
    captureMode: normalizeCaptureMode(
      disk.captureMode ?? strFromOption("captureMode")
    ),
    maxRecallChars: clampRecallChars(maxRecallChars),
    sessionStartContext: normalizeSessionStartContext(
      strFromOption("sessionStartContext") ?? disk.sessionStartContext
    ),
    projectMode: normalizeProjectMode(
      strFromOption("projectMode") ?? disk.projectMode
    ),
    projectSlug: typeof disk.projectSlug === "string" && disk.projectSlug.trim() ? disk.projectSlug.trim() : void 0,
    debug: boolFromOption(
      "debug",
      typeof disk.debug === "boolean" ? disk.debug : false
    )
  };
}
function saveConfig(next) {
  const merged = { ...loadConfig(), ...next };
  writeJsonAtomic(configPath(), merged);
  return merged;
}
function readTokens() {
  return tokenStore.read();
}
function writeTokens(tokens) {
  tokenStore.write(tokens);
}
function clearTokens() {
  tokenStore.clear();
}

// src/sanitize/index.ts
var PRIVATE_BLOCK_RE = /<(private|membase-private)>[\s\S]*?<\/\1>\s*/gi;
function sanitizeMembaseText(raw) {
  const cleaned = redactSecrets(
    stripContextBlocks(raw.replace(PRIVATE_BLOCK_RE, " "))
  );
  return normalizeLines(cleaned);
}
var looksSensitive2 = looksSensitive;
var truncateText2 = truncateText;

// src/format/index.ts
function formatBundle(bundle, index) {
  const episode = bundle.episode;
  const score = typeof bundle.relevance_score === "number" ? ` score=${bundle.relevance_score.toFixed(3)}` : "";
  const source = episode.source ? ` source=${episode.source}` : "";
  const when = episode.valid_at || episode.created_at || "";
  const facts = (bundle.edges ?? []).map((edge) => edge.fact).filter((fact) => Boolean(fact)).slice(0, 3).map((fact) => `    - ${truncateText2(fact, 180)}`).join("\n");
  const header = `${index + 1}. ${truncateText2(episode.name || episode.summary || "Memory", 180)}${score}${source}${when ? ` at=${when}` : ""}`;
  const summary = episode.summary ? `   summary: ${truncateText2(episode.summary, 240)}` : "";
  return neutralizeInjection(
    [header, summary, facts ? `   related facts:
${facts}` : ""].filter(Boolean).join("\n")
  );
}
function formatWikiDocument(doc, index) {
  const score = typeof doc.similarity === "number" ? ` score=${doc.similarity.toFixed(3)}` : "";
  const collection = doc.collection_name ? ` collection=${doc.collection_name}` : "";
  return neutralizeInjection(
    [
      `${index + 1}. ${truncateText2(doc.title, 180)}${score}${collection}`,
      `   id: ${doc.id}`,
      `   ${truncateText2(doc.content, 700)}`
    ].join("\n")
  );
}

// src/project/index.ts
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");
function normalizeProjectSlug(raw) {
  return raw.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}-]+/gu, "-").replace(/_{1,}/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
function findGitRoot(cwd) {
  let current = cwd;
  while (current && current !== (0, import_node_path4.parse)(current).root) {
    if ((0, import_node_fs4.existsSync)((0, import_node_path4.join)(current, ".git"))) return current;
    current = (0, import_node_path4.dirname)(current);
  }
  return null;
}
function remoteSlug(gitRoot) {
  try {
    const gitConfig = (0, import_node_fs4.readFileSync)((0, import_node_path4.join)(gitRoot, ".git", "config"), "utf-8");
    const match = gitConfig.match(/url\s*=\s*(.+)\n/);
    if (!match?.[1]) return null;
    const value = match[1].trim().replace(/^git@[^:]+:/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "");
    return normalizeProjectSlug(value);
  } catch {
    return null;
  }
}
function resolveProjectSlug(cwd, config) {
  if (config.projectMode === "off") return void 0;
  if (config.projectSlug) return normalizeProjectSlug(config.projectSlug);
  if (config.projectMode === "manual") return void 0;
  if (!cwd) return void 0;
  const gitRoot = findGitRoot(cwd);
  if (gitRoot)
    return remoteSlug(gitRoot) || normalizeProjectSlug((0, import_node_path4.basename)(gitRoot));
  return normalizeProjectSlug((0, import_node_path4.basename)(cwd));
}

// src/spool/index.ts
var spool = createCaptureSpool({
  stateDir: ensureDataDir,
  sanitize: sanitizeMembaseText
});
async function flushSpool(client, limit = 10) {
  return spool.flushSpool(
    (record) => client.ingestMemory({
      content: record.content,
      display_summary: record.display_summary,
      project: record.project,
      metadata: {
        ...record.metadata,
        capture_id: record.capture_id,
        capture_kind: record.capture_kind
      }
    }).then(() => {
    }),
    limit
  );
}
function pendingSpoolCount() {
  return spool.pendingSpoolCount();
}

// src/cli.ts
async function askCaptureConsent() {
  const rl = (0, import_promises.createInterface)({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Enable summary auto-capture for tool and compact summaries? [Y/n] "
    );
    return /^n/i.test(answer.trim()) ? "off" : "summary";
  } finally {
    rl.close();
  }
}
function printUsage() {
  console.log(`Membase Claude Code Plugin ${PLUGIN_VERSION}

Usage:
  membase login
  membase logout
  membase status
  membase recall <query>
  membase remember <text>
  membase wiki search <query>
  membase wiki add <title> -- <markdown>
  membase index-project <summary>
  membase project-config <slug|off|auto>
`);
}
function duplicateMcpConfigs() {
  const candidates = [
    (0, import_node_path5.join)((0, import_node_os2.homedir)(), ".claude.json"),
    (0, import_node_path5.join)(process.cwd(), ".mcp.json")
  ];
  const matches = [];
  for (const path of candidates) {
    if (!(0, import_node_fs5.existsSync)(path)) continue;
    try {
      const raw = (0, import_node_fs5.readFileSync)(path, "utf-8");
      const lower = raw.toLowerCase();
      const hasMembaseRemoteUrl = lower.includes(DEFAULT_MCP_URL);
      const hasLegacyMembaseRemote = lower.includes("membase") && lower.includes("mcp-remote");
      if (hasMembaseRemoteUrl || hasLegacyMembaseRemote) {
        matches.push(path);
      }
    } catch {
    }
  }
  return matches;
}
async function authedClient() {
  const config = loadConfig();
  const tokens = readTokens();
  if (!tokens) {
    throw new Error("Not logged in. Run /membase:login first.");
  }
  return {
    config,
    client: createClient(config.apiUrl, tokens, writeTokens)
  };
}
async function commandLogin() {
  const config = loadConfig();
  console.log(`Opening Membase OAuth login (${config.apiUrl})...`);
  const tokens = await loginWithOAuth(config.apiUrl);
  writeTokens(tokens);
  const captureMode = await askCaptureConsent();
  saveConfig({ captureMode });
  const client = createClient(config.apiUrl, tokens, writeTokens);
  await client.registerConnection().catch(() => void 0);
  console.log("Membase connected.");
  console.log(`Auto-capture: ${captureMode}`);
}
async function commandStatus() {
  const config = loadConfig();
  const tokens = readTokens();
  console.log(`Membase Claude Code Plugin ${PLUGIN_VERSION}`);
  console.log(`API: ${config.apiUrl}`);
  console.log(`Logged in: ${tokens ? "yes" : "no"}`);
  console.log(`Auto-recall: ${config.autoRecall}`);
  console.log(`Auto-wiki-recall: ${config.autoWikiRecall}`);
  console.log(`Auto-capture: ${config.captureMode}`);
  console.log(`Session-start context: ${config.sessionStartContext}`);
  console.log(`Pending capture spool: ${pendingSpoolCount()}`);
  console.log(
    `Project: ${resolveProjectSlug(process.cwd(), config) ?? "(none)"}`
  );
  const duplicates = duplicateMcpConfigs();
  if (duplicates.length > 0) {
    console.log("");
    console.log("Potential existing remote Membase MCP config detected:");
    for (const path of duplicates) console.log(`  - ${path}`);
    console.log(
      "Remove duplicate remote MCP configs if you see duplicate Membase tools in Claude Code."
    );
  }
  if (tokens) {
    const client = createClient(config.apiUrl, tokens, writeTokens);
    const result = await flushSpool(client, 20).catch((error) => ({
      flushed: 0,
      remaining: pendingSpoolCount(),
      error
    }));
    if ("flushed" in result && result.flushed > 0) {
      console.log(`Flushed pending captures: ${result.flushed}`);
    }
    await client.recordUsage().catch(() => void 0);
  }
}
async function commandRecall(query) {
  const { config, client } = await authedClient();
  const project = resolveProjectSlug(process.cwd(), config);
  const [memories, wiki] = await Promise.all([
    client.searchMemory({ query, limit: 10, project }),
    config.autoWikiRecall ? client.searchWiki({ query, limit: 5 }) : Promise.resolve([])
  ]);
  if (memories.length === 0 && wiki.length === 0) {
    console.log("No Membase context found.");
    return;
  }
  for (const [index, memory] of memories.entries()) {
    console.log(formatBundle(memory, index));
    console.log("");
  }
  for (const [index, doc] of wiki.entries()) {
    console.log(formatWikiDocument(doc, index));
    console.log("");
  }
}
async function storeMemory(text, captureKind) {
  const { config, client } = await authedClient();
  const project = resolveProjectSlug(process.cwd(), config);
  if (looksSensitive2(text)) {
    throw new Error("Refusing to store content that looks like a secret.");
  }
  const content = sanitizeMembaseText(text);
  await client.ingestMemory({
    content,
    display_summary: truncateText2(content, 180),
    project,
    metadata: {
      plugin: INGEST_PLUGIN_LABEL,
      plugin_version: PLUGIN_VERSION,
      capture_kind: captureKind,
      cwd: process.cwd(),
      project_slug: project ?? null
    }
  });
  console.log("Stored in Membase.");
}
async function commandRemember(text) {
  await storeMemory(text, "explicit");
}
async function commandIndexProject(text) {
  await storeMemory(text, "project_index");
}
async function commandWiki(args) {
  const { client } = await authedClient();
  const action = args[0];
  if (action === "search") {
    const query = args.slice(1).join(" ");
    const docs = await client.searchWiki({ query, limit: 10 });
    for (const [index, doc] of docs.entries()) {
      console.log(formatWikiDocument(doc, index));
      console.log("");
    }
    return;
  }
  if (action === "add") {
    const separator = args.indexOf("--");
    const title = separator > 1 ? args.slice(1, separator).join(" ") : args[1];
    const content = separator > 1 ? args.slice(separator + 1).join(" ") : args.slice(2).join(" ");
    if (!title || !content)
      throw new Error("Usage: membase wiki add <title> -- <markdown>");
    if (looksSensitive2(content)) {
      throw new Error(
        "Refusing to store wiki content that looks like a secret."
      );
    }
    const doc = await client.addWiki({ title, content });
    console.log(`Wiki document created: ${doc.title} (${doc.id})`);
    return;
  }
  throw new Error(
    "Usage: membase wiki search <query> | membase wiki add <title> -- <markdown>"
  );
}
function commandProjectConfig(value) {
  if (!value) {
    console.log(
      `Current project: ${resolveProjectSlug(process.cwd(), loadConfig()) ?? "(none)"}`
    );
    return;
  }
  if (value === "off") {
    saveConfig({ projectMode: "off", projectSlug: void 0 });
  } else if (value === "auto") {
    saveConfig({ projectMode: "auto_git", projectSlug: void 0 });
  } else {
    saveConfig({ projectMode: "manual", projectSlug: value });
  }
  console.log(
    `Project config updated: ${resolveProjectSlug(process.cwd(), loadConfig()) ?? "(none)"}`
  );
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }
  if (command === "login") return commandLogin();
  if (command === "logout") {
    clearTokens();
    saveConfig({ captureMode: "off" });
    console.log("Logged out of Membase.");
    return;
  }
  if (command === "status") return commandStatus();
  if (command === "recall") return commandRecall(args.join(" "));
  if (command === "remember") return commandRemember(args.join(" "));
  if (command === "wiki") return commandWiki(args);
  if (command === "index-project") return commandIndexProject(args.join(" "));
  if (command === "project-config") return commandProjectConfig(args[0]);
  printUsage();
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
