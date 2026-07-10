import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node" as const,
  target: "node18",
  format: "cjs" as const,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [],
};

// dist/ is a gitignored intermediate. Installable plugin packages must be
// self-contained, so every client ships its own committed copy (below) —
// nothing executes dist/ directly.
mkdirSync("dist", { recursive: true });

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/hooks/handler.ts"],
    outfile: "dist/hook.cjs",
  }),
  build({
    ...shared,
    entryPoints: ["src/mcp/server.ts"],
    outfile: "dist/mcp-server.cjs",
  }),
]);

// Committed, byte-identical copies per client plugin package.
// check-bundle-provenance rebuilds and diffs all of them.
// mcp-server.cjs ships only with Claude — codex/cursor use the remote HTTP MCP.
const copies: Array<[from: string, to: string]> = [
  ["dist/hook.cjs", "../../clients/claude/runtime/plugin/scripts/hook.cjs"],
  [
    "dist/mcp-server.cjs",
    "../../clients/claude/runtime/plugin/scripts/mcp-server.cjs",
  ],
  ["dist/hook.cjs", "../../clients/codex/runtime/hook.cjs"],
  ["dist/hook.cjs", "../../clients/cursor/runtime/hook.cjs"],
];

for (const [from, to] of copies) {
  try {
    chmodSync(from, 0o755);
  } catch {}
  copyFileSync(from, to);
  try {
    chmodSync(to, 0o755);
  } catch {}
}
