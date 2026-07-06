// Disk token store (north-star pillar 1, stdio bundle mode).
//
// Extracted from the Claude runtime's config module so every stdio-bundled
// client (Claude today; Cursor/Codex per docs/north-star-readiness.md) shares
// one credentials format and one atomic-write path: hook processes and the
// bundled MCP server read the SAME file, which is what makes hook-side upload
// possible without a second login. File is 0600 inside a 0700 dir.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export interface StoredTokens {
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  scope?: string;
}

export interface TokenStoreOptions {
  /** Parent state directory (created 0700 on write). */
  dir: () => string;
  /** Credentials filename inside the dir. */
  filename?: string;
}

export interface TokenStore {
  path(): string;
  read(): StoredTokens | null;
  write(tokens: StoredTokens): void;
  clear(): void;
}

export function writeJsonAtomic(
  path: string,
  value: unknown,
  mode = 0o600,
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Per-process tmp name: with a fixed `${path}.tmp`, two concurrent writers
  // race (one renames the tmp away, the other's rename throws ENOENT).
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf-8",
    mode,
  });
  renameSync(tmp, path);
  try {
    chmodSync(path, mode);
  } catch {}
}

export function createTokenStore(options: TokenStoreOptions): TokenStore {
  const filename = options.filename ?? "credentials.json";

  function path(): string {
    return join(options.dir(), filename);
  }

  function read(): StoredTokens | null {
    const file = path();
    if (!existsSync(file)) return null;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
    // JSON `null` (or any non-object) parses fine but has no properties.
    if (typeof obj !== "object" || obj === null) return null;
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

  function write(tokens: StoredTokens): void {
    writeJsonAtomic(path(), tokens);
  }

  function clear(): void {
    try {
      rmSync(path(), { force: true });
    } catch {}
  }

  return { path, read, write, clear };
}
