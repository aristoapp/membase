import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createTokenStore, writeJsonAtomic } from "@membase/capture-core";
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
  const dir =
    // Client-neutral override first: stdio-bundled clients (Cursor/Codex)
    // point this at their own state dir — or a shared one for a single
    // machine-wide login — without Claude-specific env names.
    process.env.MEMBASE_DATA_DIR ||
    process.env.CLAUDE_PLUGIN_DATA ||
    join(homedir(), ".claude", "plugins", "membase");
  // MCP-client env entries are not shell-expanded, so `~/...` arrives literal.
  return dir.startsWith("~/") ? join(homedir(), dir.slice(2)) : dir;
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

// Token I/O is delegated to the shared capture-core store (same file path,
// same on-disk format) so hook processes and any stdio-bundled client read
// one source of truth.
const tokenStore = createTokenStore({ dir: ensureDataDir });

export function credentialsPath(): string {
  return tokenStore.path();
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
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
    // Disk wins: hooks pass a captureMode option on every run, so env can
    // only be the default — otherwise it would override an explicit opt-out.
    captureMode: normalizeCaptureMode(
      disk.captureMode ?? strFromOption("captureMode"),
    ),
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
  return tokenStore.read();
}

export function writeTokens(tokens: TokenState): void {
  tokenStore.write(tokens);
}

export function clearTokens(): void {
  tokenStore.clear();
}

export function logDebug(config: PluginConfig, message: string): void {
  if (!config.debug) return;
  const logPath = join(ensureDataDir(), "debug.log");
  // Debug lines may echo memory content or API responses — keep it 0600 like
  // every other artifact in the data dir.
  writeFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, {
    flag: "a",
    mode: 0o600,
  });
}
