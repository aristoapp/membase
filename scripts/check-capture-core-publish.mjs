#!/usr/bin/env node
// Guards the tag-driven publish of @membase/capture-core.
//
// capture-core ships *inside* the openclaw runtime (which imports it at
// runtime), and the publish step skips when the version already exists on npm.
// Without this check, a source change with no version bump would silently
// publish a runtime that resolves the OLD, already-published capture-core — a
// redaction/sanitizer fix in the tagged repo would never reach users. This
// compares the local package content against what is already on npm for the
// same version and forces a bump when they differ.
//
// Exit codes (consumed by .github/workflows/publish.yml):
//   10  version not yet on npm        -> caller publishes
//    0  version on npm, content same  -> caller skips
//    1  version on npm, content DIFFERS -> hard failure, bump required

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

// package.json fields that npm injects/normalizes on publish and that do not
// reflect source content — ignored when comparing the manifest.
const VOLATILE_PKG_FIELDS = new Set(["gitHead", "dist", "readme", "_id", "_integrity"]);

function normalizePkgJson(raw) {
  const obj = JSON.parse(raw);
  for (const key of Object.keys(obj)) {
    if (key.startsWith("_") || VOLATILE_PKG_FIELDS.has(key)) delete obj[key];
  }
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function walkFiles(root) {
  const files = new Map();
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else files.set(relative(root, abs), abs);
    }
  }
  return files;
}

function fingerprint(absPath, relPath) {
  const buf = readFileSync(absPath);
  if (relPath === "package.json") return normalizePkgJson(buf.toString("utf8"));
  return createHash("sha256").update(buf).digest("hex");
}

// Compare two extracted `package/` roots; returns a list of human-readable
// differences (empty === identical content).
export function compareTrees(rootA, rootB) {
  const a = walkFiles(rootA);
  const b = walkFiles(rootB);
  const diffs = [];
  for (const rel of new Set([...a.keys(), ...b.keys()])) {
    if (!a.has(rel)) diffs.push(`only on npm: ${rel}`);
    else if (!b.has(rel)) diffs.push(`only local: ${rel}`);
    else if (fingerprint(a.get(rel), rel) !== fingerprint(b.get(rel), rel)) {
      diffs.push(`changed: ${rel}`);
    }
  }
  return diffs.sort();
}

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function packAndExtract(destDir, packArgs, packCwd) {
  mkdirSync(destDir, { recursive: true });
  const out = run("npm", ["pack", "--pack-destination", destDir, ...packArgs], packCwd);
  const tgz = out.trim().split("\n").pop().trim();
  run("tar", ["-xzf", join(destDir, tgz), "-C", destDir]);
  return join(destDir, "package");
}

function main(pkgDir) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const { name, version } = pkg;

  let published = false;
  try {
    published = run("npm", ["view", `${name}@${version}`, "version"]).trim() === version;
  } catch {
    published = false; // npm view exits non-zero when the version is absent
  }
  if (!published) {
    console.log(`${name}@${version} not on npm — publish required`);
    process.exit(10);
  }

  const work = mkdtempSync(join(tmpdir(), "capture-core-guard-"));
  const localRoot = packAndExtract(join(work, "local"), [], pkgDir);
  const remoteRoot = packAndExtract(join(work, "remote"), [`${name}@${version}`]);

  const diffs = compareTrees(remoteRoot, localRoot);
  if (diffs.length === 0) {
    console.log(`${name}@${version} unchanged vs npm — skipping publish`);
    process.exit(0);
  }
  console.error(`${name} source differs from published @${version} but the version was not bumped:`);
  for (const d of diffs) console.error(`  ${d}`);
  console.error(`Bump ${pkgDir}/package.json version before tagging.`);
  process.exit(1);
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), "capture-core-guard-selftest-"));
  const mk = (name, files) => {
    const base = join(root, name, "package");
    mkdirSync(base, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(base, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, content);
    }
    return base;
  };
  const assert = (cond, msg) => {
    if (!cond) {
      console.error(`SELF-TEST FAIL: ${msg}`);
      process.exit(1);
    }
  };

  // Identical source, only volatile package.json fields differ -> no diff.
  const npmSide = mk("npm", {
    "package.json": JSON.stringify({ name: "x", version: "1.0.0", gitHead: "abc", _id: "x@1.0.0" }),
    "dist/index.js": "REDACTED_v1",
  });
  const localSame = mk("local-same", {
    "package.json": JSON.stringify({ version: "1.0.0", name: "x" }),
    "dist/index.js": "REDACTED_v1",
  });
  assert(compareTrees(npmSide, localSame).length === 0, "identical content should produce no diffs");

  // Source changed (the redaction-fix scenario) -> flagged.
  const localChanged = mk("local-changed", {
    "package.json": JSON.stringify({ name: "x", version: "1.0.0" }),
    "dist/index.js": "REDACTED_v2_leakfix",
  });
  const changed = compareTrees(npmSide, localChanged);
  assert(changed.includes("changed: dist/index.js"), "changed source file should be flagged");

  // Added/removed files -> flagged.
  const localExtra = mk("local-extra", {
    "package.json": JSON.stringify({ name: "x", version: "1.0.0" }),
    "dist/index.js": "REDACTED_v1",
    "dist/new.js": "new",
  });
  assert(compareTrees(npmSide, localExtra).some((d) => d.includes("dist/new.js")), "added file should be flagged");

  console.log("self-test ok");
  process.exit(0);
}

const arg = process.argv[2];
if (arg === "--self-test") selfTest();
else main(arg ?? "packages/capture-core");
