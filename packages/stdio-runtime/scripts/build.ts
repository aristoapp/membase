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

// dist/ is a gitignored intermediate. The repo root is the single plugin
// payload every install channel copies, so the committed bundles live in the
// root hooks/ directory — nothing executes dist/ directly.
mkdirSync("dist", { recursive: true });

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/hooks/main.ts"],
    outfile: "dist/hook.cjs",
  }),
  build({
    ...shared,
    entryPoints: ["src/mcp/server.ts"],
    outfile: "dist/mcp-server.cjs",
  }),
]);

// Committed, byte-identical copies in the root payload.
// check-bundle-provenance rebuilds and diffs them.
// mcp-server.cjs is wired only into the Claude manifest's inline mcpServers —
// codex/cursor use the remote HTTP MCP — but ships in the same hooks/ dir for
// every install.
const copies: Array<[from: string, to: string]> = [
  ["dist/hook.cjs", "../../hooks/hook.cjs"],
  ["dist/mcp-server.cjs", "../../hooks/mcp-server.cjs"],
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
