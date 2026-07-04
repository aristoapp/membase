import { chmodSync, mkdirSync } from "node:fs";
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

mkdirSync("plugin/scripts", { recursive: true });

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/cli.ts"],
    outfile: "plugin/scripts/membase.cjs",
  }),
  build({
    ...shared,
    entryPoints: ["src/hooks/handler.ts"],
    outfile: "plugin/scripts/hook.cjs",
  }),
  build({
    ...shared,
    entryPoints: ["src/mcp/server.ts"],
    outfile: "plugin/scripts/mcp-server.cjs",
  }),
]);

for (const path of [
  "plugin/scripts/membase.cjs",
  "plugin/scripts/hook.cjs",
  "plugin/scripts/mcp-server.cjs",
  "plugin/bin/membase",
]) {
  try {
    chmodSync(path, 0o755);
  } catch {}
}
