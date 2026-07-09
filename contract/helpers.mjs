// Blind contract-test helpers. Written ONLY from contract/spec.md — no
// implementation source was read. Public entry points + black-box probing only.
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Entry points listed in contract/spec.md ("the ONLY things tests may touch").
export const CLAUDE_HOOK = join(
  REPO_ROOT,
  "clients/claude/runtime/plugin/scripts/hook.cjs",
);
export const CURSOR_HOOK = join(
  REPO_ROOT,
  "clients/cursor/runtime/cursor-hook.mjs",
);
const CAPTURE_CORE_DIST = join(
  REPO_ROOT,
  "packages/capture-core/dist/index.js",
);

/**
 * Import @membase/capture-core from built output. `pnpm contract:test`
 * prebuilds it; failing loudly here beats silently compiling a stale or
 * broken tree (the old fallback also emitted test files into dist).
 */
export async function loadCaptureCore() {
  if (!existsSync(CAPTURE_CORE_DIST)) {
    throw new Error(
      "capture-core dist missing — run via `pnpm contract:test` (it prebuilds)",
    );
  }
  return import(pathToFileURL(CAPTURE_CORE_DIST).href);
}

export const captureCoreDistUrl = () => pathToFileURL(CAPTURE_CORE_DIST).href;

/** Isolated MEMBASE_DATA_DIR with cleanup. */
export async function makeDataDir(t) {
  const dir = await mkdtemp(join(tmpdir(), "membase-contract-"));
  t?.after?.(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** `{"apiUrl": "http://127.0.0.1:<port>"}` per spec conventions. */
export async function writeConfig(dataDir, config) {
  await writeFile(join(dataDir, "config.json"), JSON.stringify(config));
}

/** credentials.json per C-TOK-1's shape. */
export async function writeCredentials(dataDir, overrides = {}) {
  const creds = {
    clientId: "contract-client",
    accessToken: "contract-access-token",
    refreshToken: "contract-refresh-token",
    ...overrides,
  };
  await writeFile(join(dataDir, "credentials.json"), JSON.stringify(creds));
  return creds;
}

/** Pre-seed spool/pending.jsonl with SpoolRecord-shaped lines (C-SPOOL-1). */
export async function writeSpool(dataDir, records) {
  await mkdir(join(dataDir, "spool"), { recursive: true });
  const lines = records
    .map((r, i) =>
      JSON.stringify({
        capture_id: r.capture_id ?? `contract-cap-${i}-${Math.random().toString(16).slice(2)}`,
        capture_kind: r.capture_kind ?? "note",
        content: r.content,
        created_at: r.created_at ?? new Date().toISOString(),
        attempts: r.attempts ?? 0,
      }),
    )
    .join("\n");
  await writeFile(join(dataDir, "spool", "pending.jsonl"), `${lines}\n`);
}

export function spoolPath(dataDir) {
  return join(dataDir, "spool", "pending.jsonl");
}

/** Raw spool text, or "" when the file does not exist. */
export function readSpoolRaw(dataDir) {
  const p = spoolPath(dataDir);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

/** Parsed spool lines. Throws if any non-empty line fails to parse. */
export function readSpool(dataDir) {
  return readSpoolRaw(dataDir)
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

export function scratchDir(dataDir) {
  return join(dataDir, "scratch");
}

/** Parsed lines of a session's scratch file, or [] when absent. */
export function readScratch(dataDir, sessionId) {
  const p = join(scratchDir(dataDir), `${sessionId}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

/** true when a session's scratch file exists on disk. */
export function scratchExists(dataDir, sessionId) {
  return existsSync(join(scratchDir(dataDir), `${sessionId}.jsonl`));
}

/**
 * Stub Membase API (node:http). Records every request; behavior is
 * scriptable per test:
 *   ingest: "ok" (default) | "quota403" | "unauthorized-once"
 *   searchBody: object served for GET /memory/search* (any recall-ish path)
 *   POST /oauth/token always answers a fresh access token and is counted.
 */
export async function startStubApi(t, opts = {}) {
  const requests = [];
  let ingestHits = 0;
  let tokenHits = 0;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const entry = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization ?? null,
        body,
      };
      try {
        entry.json = JSON.parse(body);
      } catch {
        entry.json = null;
      }
      requests.push(entry);

      const reply = (status, obj) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };

      if (req.method === "POST" && req.url === "/oauth/token") {
        tokenHits += 1;
        reply(200, {
          access_token: `refreshed-token-${tokenHits}`,
          refresh_token: `refreshed-refresh-${tokenHits}`,
          token_type: "Bearer",
          expires_in: 3600,
        });
        return;
      }
      if (req.url.startsWith("/memory/search") && opts.searchBody) {
        reply(200, opts.searchBody);
        return;
      }
      if (req.method === "POST" && req.url.startsWith("/memory/ingest")) {
        ingestHits += 1;
        if (opts.ingest === "quota403") {
          reply(403, { error: "quota_exceeded" });
          return;
        }
        if (opts.ingest === "unauthorized-once" && ingestHits === 1) {
          reply(401, { error: "token_expired" });
          return;
        }
        reply(200, { ok: true, id: `mem-${ingestHits}` });
        return;
      }
      reply(200, { ok: true });
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  t?.after?.(() => new Promise((r) => server.close(r)));
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    ingestRequests: () =>
      requests.filter(
        (r) => r.method === "POST" && r.url.startsWith("/memory/ingest"),
      ),
    tokenRequests: () =>
      requests.filter((r) => r.method === "POST" && r.url === "/oauth/token"),
    close: () => new Promise((r) => server.close(r)),
  };
}

// Env vars the entry points read (per spec) — cleared from the inherited env
// so the host session can never leak into a test.
const ENTRY_ENV_VARS = [
  "MEMBASE_DATA_DIR",
  "MEMBASE_CLIENT_SOURCE",
  "CLAUDE_PLUGIN_OPTION_captureMode",
  "MEMBASE_HOOK_BUNDLE",
  "MEMBASE_HANDOFF_FILE",
  "MEMBASE_API_URL",
];

/**
 * Run an entry point with piped stdin (never shell echo). `input` may be a
 * string, Buffer, or null. `holdStdinOpen` leaves the pipe open (C-HOOK-6).
 * Async spawn: the caller's event loop (and any stub server) keeps serving.
 */
export function runEntry(
  scriptPath,
  args = [],
  { input = "", env = {}, timeoutMs = 15000, holdStdinOpen = false, cwd } = {},
) {
  return new Promise((resolveRun) => {
    const cleanEnv = { ...process.env };
    for (const k of ENTRY_ENV_VARS) delete cleanEnv[k];
    const started = Date.now();
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: { ...cleanEnv, ...env },
      cwd: cwd ?? REPO_ROOT,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const killer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(killer);
      resolveRun({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
    // A fail-open hook may exit without reading stdin; EPIPE on our write is
    // then expected, not a failure.
    child.stdin.on("error", () => {});
    if (input !== null && input !== undefined && input !== "") {
      child.stdin.write(input);
    }
    if (!holdStdinOpen) child.stdin.end();
    // When holdStdinOpen, the pipe stays open until child exit or
    // the killer fires — exactly the "stdin held open" case C-HOOK-6 names.
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function readText(path) {
  return readFile(path, "utf8");
}
