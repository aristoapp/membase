import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_API_URL,
  DEFAULT_MAX_RECALL_CHARS,
  MAX_RECALL_CHARS,
  MIN_RECALL_CHARS,
} from "../constants.js";
import type {
  CaptureMode,
  PluginConfig,
  ProjectMode,
  SessionStartContext,
  TokenState,
} from "../types.js";

export function getDataDir(): string {
  return (
    process.env.CLAUDE_PLUGIN_DATA ||
    join(homedir(), ".claude", "plugins", "membase")
  );
}

export function getPluginRoot(): string {
  return process.env.CLAUDE_PLUGIN_ROOT || resolve(process.cwd(), "plugin");
}

export function ensureDataDir(): string {
  const dir = getDataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {}
  return dir;
}

function configPath(): string {
  return join(ensureDataDir(), "config.json");
}

export function credentialsPath(): string {
  return join(ensureDataDir(), "credentials.json");
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJsonAtomic(path: string, value: unknown, mode = 0o600): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf-8",
    mode,
  });
  renameSync(tmp, path);
  try {
    chmodSync(path, mode);
  } catch {}
}

function pluginOption(name: string): string | undefined {
  return (
    process.env[`CLAUDE_PLUGIN_OPTION_${name}`] ??
    process.env[`CLAUDE_PLUGIN_OPTION_${name.toUpperCase()}`]
  );
}

function boolFromOption(name: string, fallback: boolean): boolean {
  const value = pluginOption(name);
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function strFromOption(name: string): string | undefined {
  const value = pluginOption(name);
  return value?.trim() ? value.trim() : undefined;
}

function numberFromOption(name: string): number | undefined {
  const value = pluginOption(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCaptureMode(value: unknown): CaptureMode {
  return value === "summary" ? "summary" : "off";
}

function normalizeProjectMode(value: unknown): ProjectMode {
  if (value === "manual" || value === "off") return value;
  return "auto_git";
}

function normalizeSessionStartContext(value: unknown): SessionStartContext {
  if (value === "off" || value === "profile") return value;
  return "minimal";
}

function clampRecallChars(value: unknown): number {
  const raw = typeof value === "number" ? value : DEFAULT_MAX_RECALL_CHARS;
  return Math.max(MIN_RECALL_CHARS, Math.min(MAX_RECALL_CHARS, raw));
}

export function loadConfig(): PluginConfig {
  const disk = readJsonObject(configPath());
  const apiUrl =
    strFromOption("apiUrl") ||
    (typeof disk.apiUrl === "string" ? disk.apiUrl : "") ||
    DEFAULT_API_URL;
  const maxRecallChars =
    numberFromOption("maxRecallChars") ??
    (typeof disk.maxRecallChars === "number"
      ? disk.maxRecallChars
      : DEFAULT_MAX_RECALL_CHARS);

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    autoRecall: boolFromOption(
      "autoRecall",
      typeof disk.autoRecall === "boolean" ? disk.autoRecall : true,
    ),
    autoWikiRecall: boolFromOption(
      "autoWikiRecall",
      typeof disk.autoWikiRecall === "boolean" ? disk.autoWikiRecall : false,
    ),
    captureMode: normalizeCaptureMode(disk.captureMode),
    maxRecallChars: clampRecallChars(maxRecallChars),
    sessionStartContext: normalizeSessionStartContext(
      strFromOption("sessionStartContext") ?? disk.sessionStartContext,
    ),
    projectMode: normalizeProjectMode(
      strFromOption("projectMode") ?? disk.projectMode,
    ),
    projectSlug:
      typeof disk.projectSlug === "string" && disk.projectSlug.trim()
        ? disk.projectSlug.trim()
        : undefined,
    debug: boolFromOption(
      "debug",
      typeof disk.debug === "boolean" ? disk.debug : false,
    ),
  };
}

export function saveConfig(next: Partial<PluginConfig>): PluginConfig {
  const merged = { ...loadConfig(), ...next };
  writeJsonAtomic(configPath(), merged);
  return merged;
}

export function readTokens(): TokenState | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  const obj = readJsonObject(path);
  if (
    typeof obj.clientId !== "string" ||
    typeof obj.accessToken !== "string" ||
    typeof obj.refreshToken !== "string"
  ) {
    return null;
  }
  return {
    clientId: obj.clientId,
    clientSecret:
      typeof obj.clientSecret === "string" ? obj.clientSecret : undefined,
    accessToken: obj.accessToken,
    refreshToken: obj.refreshToken,
    expiresAt: typeof obj.expiresAt === "number" ? obj.expiresAt : undefined,
    scope: typeof obj.scope === "string" ? obj.scope : undefined,
  };
}

export function writeTokens(tokens: TokenState): void {
  writeJsonAtomic(credentialsPath(), tokens);
}

export function clearTokens(): void {
  try {
    rmSync(credentialsPath(), { force: true });
  } catch {}
}

export function logDebug(config: PluginConfig, message: string): void {
  if (!config.debug) return;
  const logPath = join(ensureDataDir(), "debug.log");
  writeFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, {
    flag: "a",
  });
}
