import { chmodSync, cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { writeJsonAtomic } from "@membase/capture-core";
import type { MembasePluginConfig, OpenClawPluginApi } from "./types";

const DEFAULT_API_URL = "https://api.membase.so";
export const REDACTED_TOKEN_SENTINEL = "__OPENCLAW_REDACTED__";

export function resolveOpenClawStateDir(): string {
  const configured = process.env.OPENCLAW_STATE_DIR?.trim();
  return configured ? expandHomePath(configured) : join(homedir(), ".openclaw");
}

export function resolveOpenClawConfigPath(): string {
  const configured = process.env.OPENCLAW_CONFIG_PATH?.trim();
  return configured
    ? expandHomePath(configured)
    : join(resolveOpenClawStateDir(), "openclaw.json");
}

// Safe persistent location — outside extensions/ which is wiped on plugin update.
export function resolveDefaultTokenFilePath(): string {
  return join(
    resolveOpenClawStateDir(),
    "credentials",
    "openclaw-membase.json",
  );
}

// State dir for the failure-path capture spool. Sibling of the
// token dir under the OpenClaw state dir so it survives plugin updates (not in
// extensions/). MEMBASE_DATA_DIR overrides it, matching the other clients.
export function membaseStateDir(): string {
  const override = process.env.MEMBASE_DATA_DIR?.trim();
  // Expand a leading ~/ so an override like `~/foo` doesn't create a literal
  // `~` directory — matches the Claude client's config handling.
  if (override) return expandHomePath(override);
  return join(resolveOpenClawStateDir(), "membase");
}

// Returns true if a path is inside OpenClaw's own extensions/ — that directory
// is fully replaced whenever openclaw plugins update/reinstall, so token files
// stored there will be lost. Only the real OpenClaw extensions locations count
// (state dir and the legacy ~/.openclaw); a generic "/extensions/" segment in an
// operator-chosen path (e.g. ~/Dropbox/extensions/) must NOT be treated as
// volatile plugin storage.
export function isInsideExtensionsDir(tokenFile: string): boolean {
  const normalized = tokenFile.split("\\").join("/");
  const toExtensions = (dir: string) =>
    `${dir.split("\\").join("/")}/extensions/`;
  const stateExtensions = toExtensions(resolveOpenClawStateDir());
  const legacyExtensions = toExtensions(join(homedir(), ".openclaw"));
  return (
    normalized.includes(stateExtensions) ||
    normalized.includes(legacyExtensions)
  );
}

// When OPENCLAW_STATE_DIR relocates the state dir away from the legacy
// ~/.openclaw location, an older install left its token file and capture spool
// behind. Copy them into the new location (never overwriting anything already
// there) so an upgraded gateway stays authenticated and still drains the old
// spool. No-op when the state dir already is ~/.openclaw.
export function migrateLegacyStateDir(
  hasExplicitTokenFile: boolean,
  logger?: OpenClawPluginApi["logger"],
): void {
  const legacyStateDir = join(homedir(), ".openclaw");
  if (resolveOpenClawStateDir() === legacyStateDir) return;

  // Token file — only for the default path; an explicit tokenFile is the
  // operator's own choice and is resolved directly.
  if (!hasExplicitTokenFile) {
    const newTokenFile = resolveDefaultTokenFilePath();
    const legacyTokenFile = join(
      legacyStateDir,
      "credentials",
      "openclaw-membase.json",
    );
    if (!existsSync(newTokenFile) && existsSync(legacyTokenFile)) {
      const legacyTokens = readTokenFile(legacyTokenFile, logger);
      if (legacyTokens.accessToken || legacyTokens.refreshToken) {
        try {
          writeTokenFile(newTokenFile, legacyTokens);
          logger?.info(
            "membase: migrated token file from ~/.openclaw to OPENCLAW_STATE_DIR",
          );
        } catch (err) {
          logger?.error(
            "membase: failed to migrate token file to OPENCLAW_STATE_DIR",
            err,
          );
        }
      }
    }
  }

  // Capture spool — skip when MEMBASE_DATA_DIR pins it somewhere unrelated.
  if (!process.env.MEMBASE_DATA_DIR?.trim()) {
    const legacyMembaseDir = join(legacyStateDir, "membase");
    const newMembaseDir = membaseStateDir();
    if (legacyMembaseDir !== newMembaseDir && existsSync(legacyMembaseDir)) {
      try {
        // force:false + errorOnExist:false copies missing files and leaves any
        // already present in the new dir untouched.
        cpSync(legacyMembaseDir, newMembaseDir, {
          recursive: true,
          force: false,
          errorOnExist: false,
        });
        logger?.info(
          "membase: migrated capture spool from ~/.openclaw to OPENCLAW_STATE_DIR",
        );
      } catch (err) {
        logger?.error(
          "membase: failed to migrate capture spool to OPENCLAW_STATE_DIR",
          err,
        );
      }
    }
  }
}

const KNOWN_KEYS = new Set([
  "apiUrl",
  "clientId",
  "tokenFile",
  "accessToken",
  "refreshToken",
  "autoRecall",
  "autoWikiRecall",
  "autoCapture",
  "maxRecallChars",
  "debug",
]);

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function isRedactedTokenValue(value: unknown): boolean {
  return typeof value === "string" && value === REDACTED_TOKEN_SENTINEL;
}

function normalizeTokenValue(value: unknown): string {
  if (isRedactedTokenValue(value)) {
    return "";
  }
  return str(value, "");
}

function expandHomePath(inputPath: string): string {
  if (inputPath === "~") return homedir();
  if (inputPath.startsWith("~/")) {
    return join(homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function asTokenPair(value: unknown): TokenPair {
  if (!value || typeof value !== "object") {
    return { accessToken: "", refreshToken: "" };
  }

  const obj = value as Record<string, unknown>;
  return {
    accessToken: normalizeTokenValue(obj.accessToken),
    refreshToken: normalizeTokenValue(obj.refreshToken),
  };
}

export function resolveTokenFilePath(
  pluginConfig: Record<string, unknown> = {},
): string {
  const configured = str(pluginConfig.tokenFile, "");
  return expandHomePath(configured || resolveDefaultTokenFilePath());
}

export function readTokenFile(
  tokenFile: string,
  logger?: OpenClawPluginApi["logger"],
): TokenPair {
  try {
    const raw = readFileSync(tokenFile, "utf-8");
    const parsed = JSON.parse(raw);
    if (
      logger &&
      parsed &&
      typeof parsed === "object" &&
      (isRedactedTokenValue((parsed as Record<string, unknown>).accessToken) ||
        isRedactedTokenValue((parsed as Record<string, unknown>).refreshToken))
    ) {
      logger.warn(
        "membase: redacted token marker found in token file; treating as missing tokens",
      );
    }
    return asTokenPair(parsed);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return { accessToken: "", refreshToken: "" };
    }
    if (logger) {
      logger.warn(
        `membase: failed to read token file at ${tokenFile}; falling back to plugin config`,
      );
    }
    return { accessToken: "", refreshToken: "" };
  }
}

export function writeTokenFile(tokenFile: string, tokens: TokenPair): void {
  // Existing dirs keep prior permissions; writeJsonAtomic only enforces 0o700
  // on create, so tighten an already-present credentials dir best-effort here.
  try {
    chmodSync(dirname(tokenFile), 0o700);
  } catch {
    // Ignore platform-specific permission limitations (e.g. Windows ACLs), or a
    // missing dir — writeJsonAtomic recreates it with the right mode.
  }
  // Shared atomic write: mkdir 0o700, per-process tmp (avoids the login/refresh
  // rename race), 0o600 file, rename, tmp cleanup on failure.
  writeJsonAtomic(tokenFile, {
    accessToken: str(tokens.accessToken, ""),
    refreshToken: str(tokens.refreshToken, ""),
  });
}

export function parseConfig(
  pluginConfig: Record<string, unknown> = {},
  logger?: OpenClawPluginApi["logger"],
): MembasePluginConfig {
  const unknownKeys = Object.keys(pluginConfig).filter(
    (k) => !KNOWN_KEYS.has(k),
  );
  if (unknownKeys.length > 0 && logger) {
    logger.warn(
      `membase: unknown config keys ignored: ${unknownKeys.join(", ")}`,
    );
  }

  const tokenFile = resolveTokenFilePath(pluginConfig);
  const fileTokens = readTokenFile(tokenFile, logger);

  return {
    apiUrl: str(pluginConfig.apiUrl, "") || DEFAULT_API_URL,
    clientId: str(pluginConfig.clientId, ""),
    tokenFile,
    accessToken:
      fileTokens.accessToken || normalizeTokenValue(pluginConfig.accessToken),
    refreshToken:
      fileTokens.refreshToken || normalizeTokenValue(pluginConfig.refreshToken),
    autoRecall: (pluginConfig.autoRecall as boolean) ?? false,
    autoWikiRecall: (pluginConfig.autoWikiRecall as boolean) ?? false,
    autoCapture: (pluginConfig.autoCapture as boolean) ?? true,
    maxRecallChars: Math.max(
      500,
      Math.min((pluginConfig.maxRecallChars as number) ?? 4000, 16000),
    ),
    debug: (pluginConfig.debug as boolean) ?? false,
  };
}
