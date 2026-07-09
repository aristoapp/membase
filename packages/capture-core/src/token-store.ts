// Disk token store (stdio bundle mode).
//
// Extracted from the Claude runtime's config module so every stdio-bundled
// client (Claude today; Cursor/Codex next) shares
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

export function writeTextAtomic(
  path: string,
  text: string,
  mode = 0o600,
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Per-process tmp name: with a fixed `${path}.tmp`, two concurrent writers
  // race (one renames the tmp away, the other's rename throws ENOENT). The
  // rename is atomic, so a reader never sees a torn or truncated file and a
  // crash mid-write leaves the previous content intact.
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, text, { encoding: "utf-8", mode });
  try {
    renameSync(tmp, path);
  } catch (err) {
    // Rename failed after the tmp was written (e.g. the dir was removed by a
    // concurrent logout). Don't leak a tmp file that may hold a credential.
    try {
      rmSync(tmp, { force: true });
    } catch {}
    throw err;
  }
  try {
    chmodSync(path, mode);
  } catch {}
}

export function writeJsonAtomic(
  path: string,
  value: unknown,
  mode = 0o600,
): void {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, mode);
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
