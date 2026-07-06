import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTokenStore, type StoredTokens } from "./index";

const dirs: string[] = [];

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), "token-store-"));
  dirs.push(dir);
  return { store: createTokenStore({ dir: () => dir }), dir };
}

const tokens: StoredTokens = {
  clientId: "client-1",
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: 1_800_000_000,
  scope: "memory",
};

afterEach(() => {
  while (dirs.length) {
    rmSync(dirs.pop() as string, { recursive: true, force: true });
  }
});

describe("token store", () => {
  test("write→read round-trips and file is 0600", () => {
    const { store } = makeStore();
    store.write(tokens);
    expect(store.read()).toEqual(tokens);
    expect(statSync(store.path()).mode & 0o777).toBe(0o600);
  });

  test("read returns null for missing, corrupt, or incomplete files", () => {
    const { store } = makeStore();
    expect(store.read()).toBeNull();
    writeFileSync(store.path(), "not json");
    expect(store.read()).toBeNull();
    writeFileSync(store.path(), JSON.stringify({ clientId: "only-id" }));
    expect(store.read()).toBeNull();
    writeFileSync(store.path(), "null");
    expect(store.read()).toBeNull();
  });

  test("clear removes credentials and is idempotent", () => {
    const { store } = makeStore();
    store.write(tokens);
    store.clear();
    expect(store.read()).toBeNull();
    store.clear();
  });

  test("write is atomic — no leftover .tmp and content is valid json", () => {
    const { store } = makeStore();
    store.write(tokens);
    expect(() => statSync(`${store.path()}.tmp.${process.pid}`)).toThrow();
    expect(JSON.parse(readFileSync(store.path(), "utf-8"))).toMatchObject({
      clientId: "client-1",
    });
  });
});
