#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_PATH = "clients/openclaw/package.json";
const MANIFEST_PATH = "clients/openclaw/openclaw.plugin.json";

const failures = [];

const packageJson = readJson(PACKAGE_PATH);
const manifest = readJson(MANIFEST_PATH);

if (packageJson) {
  assert(
    packageJson.name === "@membase/client-openclaw",
    `${PACKAGE_PATH}: unexpected package name`
  );
  assert(packageJson.private === true, `${PACKAGE_PATH}: package must stay private`);
  assert(
    packageJson.scripts?.typecheck === "tsc -p tsconfig.json --pretty false",
    `${PACKAGE_PATH}: scripts.typecheck must stay wired`
  );
  assert(
    packageJson.scripts?.build === "tsc -p tsconfig.json",
    `${PACKAGE_PATH}: scripts.build must stay wired`
  );
  assert(
    Array.isArray(packageJson.openclaw?.extensions) &&
      packageJson.openclaw.extensions.includes("./dist/index.js"),
    `${PACKAGE_PATH}: openclaw.extensions must point at the built native entrypoint`
  );
  assertNoPublishingScripts(PACKAGE_PATH, packageJson.scripts ?? {});
}

if (manifest) {
  assert(manifest.id === "openclaw-membase", `${MANIFEST_PATH}: id mismatch`);
  assert(manifest.kind === "memory", `${MANIFEST_PATH}: kind mismatch`);
  assert(
    Array.isArray(manifest.skills) && manifest.skills.includes("skills"),
    `${MANIFEST_PATH}: skills directory is missing`
  );
  assert(
    manifest.configSchema?.additionalProperties === false,
    `${MANIFEST_PATH}: config schema must reject undeclared keys`
  );
  assert(
    manifest.uiHints?.accessToken?.sensitive === true &&
      manifest.uiHints?.refreshToken?.sensitive === true,
    `${MANIFEST_PATH}: OAuth access/refresh token hints must be marked sensitive`
  );
  assert(
    !("apiKeyEnv" in (manifest.uiHints ?? {})) &&
      !("apiKeyEnv" in (manifest.configSchema?.properties ?? {})),
    `${MANIFEST_PATH}: must not declare apiKeyEnv (OAuth-based auth, no user API key)`
  );
  assertNoRawSecretDefaults(MANIFEST_PATH, manifest.configSchema?.properties ?? {});
}

if (failures.length === 0) {
  run("pnpm", ["--filter", "@membase/client-openclaw", "typecheck"]);
  run("pnpm", ["--filter", "@membase/client-openclaw", "build"]);
  assertFileExists("clients/openclaw/dist/index.js");
  assertFileExists("clients/openclaw/dist/index.d.ts");
  await assertNativeEntrypoint("clients/openclaw/dist/index.js");
}

if (failures.length > 0) {
  console.error("OpenClaw native parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OpenClaw native parity check passed.");

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: unable to read JSON (${error.message})`);
    return undefined;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    failures.push(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
}

function assertFileExists(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    failures.push(`${relativePath}: expected build output is missing`);
  }
}

async function assertNativeEntrypoint(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  try {
    const module = await import(pathToFileURL(absolutePath).href);
    const extension = module.default;
    assert(extension?.id === "openclaw-membase", `${relativePath}: default extension id mismatch`);
    assert(extension?.kind === "memory", `${relativePath}: default extension kind mismatch`);
    assert(typeof extension?.register === "function", `${relativePath}: default extension register function missing`);
  } catch (error) {
    failures.push(`${relativePath}: unable to import native entrypoint (${error.message})`);
  }
}

function assertNoPublishingScripts(relativePath, scripts) {
  for (const [name, command] of Object.entries(scripts)) {
    if (/publish/i.test(name) || /\b(?:npm|pnpm|bun)\s+publish\b/i.test(command)) {
      failures.push(`${relativePath}: publishing script ${JSON.stringify(name)} is not allowed`);
    }
  }
}

function assertNoRawSecretDefaults(relativePath, properties) {
  for (const [name, schema] of Object.entries(properties)) {
    if (!/(?:key|token|secret|password)/i.test(name)) {
      continue;
    }

    if (/Env$/i.test(name) && /^[A-Z0-9_]+$/.test(String(schema.default ?? ""))) {
      continue;
    }

    if ("default" in schema) {
      failures.push(`${relativePath}: sensitive field ${name} must not define a default`);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}
