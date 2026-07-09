#!/usr/bin/env node
// Guard: the committed Claude plugin bundles (plugin/scripts/*.cjs) must be
// exactly what `bun run build` produces from src/. Without this, a
// bundle-only edit (accidental or malicious) ships invisibly — the bundles
// are what users actually execute. esbuild output is deterministic, so a
// byte-level git diff is a reliable provenance check.
import { execSync } from "node:child_process";

const runtimeDir = "clients/claude/runtime";
const bundleDir = `${runtimeDir}/plugin/scripts`;

try {
  execSync("bun run build", { cwd: runtimeDir, stdio: "inherit" });
} catch {
  console.error(
    "Claude bundle provenance check failed: `bun run build` errored (is bun installed?).",
  );
  process.exit(1);
}

try {
  execSync(`git diff --exit-code -- ${bundleDir}`, { stdio: "inherit" });
} catch {
  console.error(
    `\nClaude bundle provenance check failed: committed bundles under ${bundleDir} ` +
      "do not match a fresh build of src/.\n" +
      "If you changed src/: rebuild and commit the bundles — (cd clients/claude/runtime && bun run build).\n" +
      "If you changed only the bundles: don't — edit src/ instead; the bundles are generated.",
  );
  process.exit(1);
}

console.log("Claude bundle provenance check passed (bundles match a fresh build of src/).");
