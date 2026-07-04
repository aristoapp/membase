import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDataDir } from "./config/index.js";
import { PLUGIN_VERSION } from "./constants.js";

const MARKETPLACE_URL =
  "https://raw.githubusercontent.com/aristoapp/claude-membase/main/.claude-plugin/marketplace.json";
const MARKETPLACE_NAME = "membase-plugins";
const PLUGIN_NAME = "membase";
const FETCH_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface UpdateCheckState {
  checked_at: string;
  current_version: string;
  latest_version: string | null;
  shown_at: string | null;
}

interface RefreshDeps {
  fetchImpl?: FetchLike;
  loadStateFn?: typeof loadState;
  saveStateFn?: typeof saveState;
  currentVersion?: string;
  now?: () => Date;
}

interface NoticeDeps extends RefreshDeps {}

export function updateCheckStatePath(): string {
  return join(getDataDir(), "update-check.json");
}

export function isNewerVersion(remote: string, local: string): boolean {
  const parse = (value: string) =>
    (value.split("-", 1)[0] || value).split(".").map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
  const remoteParts = parse(remote);
  const localParts = parse(local);
  const length = Math.max(remoteParts.length, localParts.length, 3);

  for (let index = 0; index < length; index++) {
    const remotePart = remoteParts[index] ?? 0;
    const localPart = localParts[index] ?? 0;
    if (remotePart > localPart) return true;
    if (remotePart < localPart) return false;
  }
  return false;
}

async function loadState(): Promise<UpdateCheckState | null> {
  const path = updateCheckStatePath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(
      await readFile(path, "utf-8"),
    ) as Partial<UpdateCheckState>;
    if (typeof parsed.checked_at !== "string") return null;
    return {
      checked_at: parsed.checked_at,
      current_version:
        typeof parsed.current_version === "string"
          ? parsed.current_version
          : PLUGIN_VERSION,
      latest_version:
        typeof parsed.latest_version === "string"
          ? parsed.latest_version
          : null,
      shown_at: typeof parsed.shown_at === "string" ? parsed.shown_at : null,
    };
  } catch {
    return null;
  }
}

async function saveState(state: UpdateCheckState): Promise<void> {
  const dir = getDataDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(
    updateCheckStatePath(),
    `${JSON.stringify(state, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
}

function isFreshCheck(checkedAt: string, now: Date): boolean {
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) return false;
  return now.getTime() - checkedAtMs < CACHE_TTL_MS;
}

function isSameUtcDay(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const then = new Date(parsed);
  return (
    then.getUTCFullYear() === now.getUTCFullYear() &&
    then.getUTCMonth() === now.getUTCMonth() &&
    then.getUTCDate() === now.getUTCDate()
  );
}

export async function fetchLatestVersion(
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(MARKETPLACE_URL, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      plugins?: Array<Record<string, unknown>>;
    };
    const plugin = Array.isArray(body.plugins)
      ? body.plugins.find((entry) => entry.name === PLUGIN_NAME)
      : undefined;
    return typeof plugin?.version === "string" ? plugin.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshLatestVersion(
  deps: RefreshDeps = {},
): Promise<void> {
  const load = deps.loadStateFn ?? loadState;
  const save = deps.saveStateFn ?? saveState;
  const fetchVersion = deps.fetchImpl
    ? () => fetchLatestVersion(deps.fetchImpl)
    : () => fetchLatestVersion();
  const currentVersion = deps.currentVersion ?? PLUGIN_VERSION;
  const now = deps.now?.() ?? new Date();

  const existing = await load();
  if (
    existing?.checked_at &&
    existing.current_version === currentVersion &&
    isFreshCheck(existing.checked_at, now)
  ) {
    return;
  }

  const latestVersion = await fetchVersion();
  if (!latestVersion) return;

  await save({
    checked_at: now.toISOString(),
    current_version: currentVersion,
    latest_version: latestVersion,
    shown_at:
      existing?.latest_version === latestVersion
        ? (existing.shown_at ?? null)
        : null,
  });
}

export function buildUpdateNotice(current: string, latest: string): string {
  return [
    `Membase Claude Code plugin update available: ${current} -> ${latest}.`,
    "In your terminal, verify plugin support:",
    "claude plugin --help",
    "Then update:",
    `claude plugin marketplace update ${MARKETPLACE_NAME}`,
    `claude plugin update ${PLUGIN_NAME}@${MARKETPLACE_NAME}`,
    "Restart Claude Code after updating.",
  ].join("\n");
}

export async function consumeUpdateNotice(
  deps: NoticeDeps = {},
): Promise<string | null> {
  const load = deps.loadStateFn ?? loadState;
  const save = deps.saveStateFn ?? saveState;
  const currentVersion = deps.currentVersion ?? PLUGIN_VERSION;
  const now = deps.now?.() ?? new Date();

  let state = await load();
  if (!state) {
    await refreshLatestVersion(deps).catch(() => undefined);
    state = await load();
  }
  if (!state?.latest_version) return null;
  if (state.current_version !== currentVersion) return null;
  if (!isNewerVersion(state.latest_version, currentVersion)) return null;
  if (isSameUtcDay(state.shown_at, now)) return null;

  try {
    await save({ ...state, shown_at: now.toISOString() });
  } catch {}

  return buildUpdateNotice(currentVersion, state.latest_version);
}

export async function withUpdateNotice(
  text: string,
  deps: NoticeDeps = {},
): Promise<string> {
  try {
    const notice = await consumeUpdateNotice(deps);
    return notice ? `${text}\n\n---\n${notice}` : text;
  } catch {
    return text;
  }
}

export async function toolResponse(
  text: string,
  deps: NoticeDeps = {},
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const withNotice = await withUpdateNotice(text, deps);
  return { content: [{ type: "text", text: withNotice }] };
}

export function startBackgroundUpdateCheck(): void {
  refreshLatestVersion().catch(() => undefined);
}
