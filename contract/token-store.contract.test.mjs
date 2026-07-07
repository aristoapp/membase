// Contracts: C-TOK-1..3 (contract/spec.md "Token store" section).
import { test } from "node:test";
import assert from "node:assert/strict";
import { statSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadCaptureCore, makeDataDir } from "./helpers.mjs";

// SPEC-AMBIGUITY: the spec names createTokenStore but not its option shape.
// Black-box probing found it requires { dir: () => path }; filename defaults
// to "credentials.json" (the contract-surface file name).
async function makeStore(t) {
  const core = await loadCaptureCore();
  const dataDir = await makeDataDir(t);
  const stateDir = join(dataDir, "state");
  return { store: core.createTokenStore({ dir: () => stateDir }), stateDir };
}

test("C-TOK-1 credentials.json shape round-trips through write/read", async (t) => {
  const { store } = await makeStore(t);
  const full = {
    clientId: "client-abc",
    accessToken: "access-abc",
    refreshToken: "refresh-abc",
    expiresAt: 1793000000,
    scope: "memory:write",
    clientSecret: "secret-abc",
  };
  store.write(full);
  const back = store.read();
  assert.equal(back.clientId, full.clientId);
  assert.equal(back.accessToken, full.accessToken);
  assert.equal(back.refreshToken, full.refreshToken);
  assert.equal(back.expiresAt, full.expiresAt);
  assert.equal(back.scope, full.scope);

  // file on disk is the documented contract surface
  const onDisk = JSON.parse(readFileSync(store.path(), "utf8"));
  assert.equal(typeof onDisk.clientId, "string");
  assert.equal(typeof onDisk.accessToken, "string");
  assert.equal(typeof onDisk.refreshToken, "string");
  assert.ok(store.path().endsWith("credentials.json"));

  // optional fields really are optional
  const minimal = {
    clientId: "c2",
    accessToken: "a2",
    refreshToken: "r2",
  };
  store.write(minimal);
  const back2 = store.read();
  assert.ok(back2, "minimal required-fields-only tokens must round-trip");
  assert.equal(back2.clientId, "c2");
  assert.equal(back2.accessToken, "a2");
  assert.equal(back2.refreshToken, "r2");
});

test("C-TOK-2 credentials file is 0600 inside a 0700 dir", async (t) => {
  const { store } = await makeStore(t);
  store.write({ clientId: "c", accessToken: "a", refreshToken: "r" });
  const fileMode = statSync(store.path()).mode & 0o777;
  const dirMode = statSync(dirname(store.path())).mode & 0o777;
  assert.equal(
    fileMode,
    0o600,
    `credentials file mode 0${fileMode.toString(8)}, expected 0600`,
  );
  assert.equal(
    dirMode,
    0o700,
    `credentials dir mode 0${dirMode.toString(8)}, expected 0700`,
  );
});

test("C-TOK-3 corrupt credentials file: read() returns null, never throws", async (t) => {
  const { store } = await makeStore(t);
  store.write({ clientId: "c", accessToken: "a", refreshToken: "r" });
  const cases = [
    ["not JSON", "this is { not json"],
    ["JSON null", "null"],
    ["missing required field", JSON.stringify({ accessToken: "only-this" })],
    ["empty file", ""],
    ["JSON array", "[1,2,3]"],
    ["required field wrong type", JSON.stringify({ clientId: 7, accessToken: "a", refreshToken: "r" })],
  ];
  for (const [label, contents] of cases) {
    await writeFile(store.path(), contents);
    let result;
    assert.doesNotThrow(() => {
      result = store.read();
    }, `read() threw on ${label}`);
    assert.equal(result, null, `read() must return null for ${label}`);
  }
});

test("C-TOK-3 missing credentials file: read() returns null", async (t) => {
  const { store } = await makeStore(t);
  assert.equal(store.read(), null);
});
