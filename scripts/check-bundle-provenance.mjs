#!/usr/bin/env node
// Guard: the committed stdio-runtime bundles in the root hooks/ payload must
// be exactly what `bun run build` in packages/stdio-runtime produces from
// src/. Without this, a bundle-only edit (accidental or malicious) ships
// invisibly — the bundles are what users actually execute. esbuild output is
// deterministic, so a byte-level git diff is a reliable provenance check.
import { execSync } from "node:child_process";

const runtimeDir = "packages/stdio-runtime";
const bundlePaths = ["hooks/hook.cjs", "hooks/mcp-server.cjs"];

try {
  execSync("bun run build", { cwd: runtimeDir, stdio: "inherit" });
} catch {
  console.error(
    "Bundle provenance check failed: `bun run build` errored (is bun installed?).",
  );
  process.exit(1);
}

try {
  execSync(`git diff --exit-code -- ${bundlePaths.join(" ")}`, {
    stdio: "inherit",
  });
} catch {
  console.error(
    `\nBundle provenance check failed: committed bundles (${bundlePaths.join(", ")}) do not match a fresh build of src/.\nIf you changed src/: rebuild and commit the bundles — (cd ${runtimeDir} && bun run build).\nIf you changed only the bundles: don't — edit src/ instead; the bundles are generated.`,
  );
  process.exit(1);
}

console.log(
  "Bundle provenance check passed (all client bundle copies match a fresh build of src/).",
);
