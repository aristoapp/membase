#!/usr/bin/env node
// Smoke: `npx plugins add <repo>` (vercel-labs plugins CLI) installs the root
// payload into Claude Code, Cursor, and Codex. Guards the conventions the CLI
// depends on — root marketplace/vendor manifests, hooks.json env-var
// rewriting, and the committed Codex `interface` block that must keep the
// installer from re-pointing mcpServers at the Claude-owned .mcp.json.
//
// The CLI mutates the plugin dir in place (marketplace generation, env-var
// translation), so it runs against a fresh `git clone` of the COMMITTED tree
// — which also proves the committed artifacts alone are a complete install.
// Network: one npm fetch of the pinned CLI. Not part of `pnpm check`; wired
// as `pnpm smoke:install` and a CI step.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGINS_CLI_VERSION = "1.3.1";
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
const work = mkdtempSync(path.join(tmpdir(), "membase-plugins-cli-"));
const home = path.join(work, "home");
const repo = path.join(work, "repo");
const bin = path.join(work, "bin");
mkdirSync(home, { recursive: true });
mkdirSync(bin, { recursive: true });

// Stub host binaries so the CLI's `which claude|cursor|codex` detection
// reports all three targets without touching the real machine config.
for (const name of ["claude", "cursor", "codex"]) {
  const stub = path.join(bin, name);
  writeFileSync(stub, "#!/bin/sh\nexit 0\n");
  chmodSync(stub, 0o755);
}

try {
  execFileSync("git", ["clone", "--quiet", "--local", "--depth", "1", ROOT_DIR, repo], {
    stdio: "pipe",
  });

  execFileSync(
    "npx",
    ["-y", `plugins@${PLUGINS_CLI_VERSION}`, "add", repo, "--yes"],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        HOME: home,
        PATH: `${bin}:${process.env.PATH}`,
        // The CLI reads git identity for nothing, but keep npx quiet/cacheable.
        npm_config_yes: "true",
      },
      timeout: 300_000,
    },
  );

  // --- Claude Code ---
  const claudeCache = path.join(home, ".claude", "plugins", "cache", "membase-plugins", "membase");
  const claudeVersions = existsSync(claudeCache) ? readdirSync(claudeCache) : [];
  if (claudeVersions.length !== 1) {
    failures.push(`claude: expected one cached install under ${claudeCache}`);
  } else {
    const installed = path.join(claudeCache, claudeVersions[0]);
    for (const rel of ["hooks/hook.cjs", "hooks/hooks.json", "hooks/mcp-server.cjs", ".mcp.json", "commands", "skills"]) {
      if (!existsSync(path.join(installed, rel))) {
        failures.push(`claude: installed copy is missing ${rel}`);
      }
    }
  }
  const settings = readJson(path.join(home, ".claude", "settings.json"));
  if (settings?.enabledPlugins?.["membase@membase-plugins"] !== true) {
    failures.push("claude: settings.json must enable membase@membase-plugins");
  }
  const installedPlugins = readJson(
    path.join(home, ".claude", "plugins", "installed_plugins.json"),
  );
  if (!installedPlugins?.plugins?.["membase@membase-plugins"]) {
    failures.push("claude: installed_plugins.json must register membase@membase-plugins");
  }

  // --- Cursor ---
  // On macOS/Linux the CLI serves Cursor from the SAME Claude plugin cache
  // (Cursor consumes the Claude plugin system; ~/.cursor/extensions is its
  // win32-only path), registered via the marketplaces copy. When Claude was
  // installed first the Cursor step is deliberately a no-op.
  const marketplaceCopy = path.join(home, ".claude", "plugins", "marketplaces", "membase-plugins");
  if (!existsSync(path.join(marketplaceCopy, ".claude-plugin", "marketplace.json"))) {
    failures.push("cursor/claude: marketplaces/membase-plugins copy must exist for host discovery");
  }
  if (claudeVersions.length === 1) {
    const installed = path.join(claudeCache, claudeVersions[0]);
    const cursorMcp = readJson(path.join(installed, "mcp.json"));
    if (cursorMcp?.mcpServers?.membase?.url !== "https://mcp.membase.so/mcp") {
      failures.push("cursor: installed payload's mcp.json must keep the remote HTTP MCP");
    }
  }

  // --- Codex ---
  const codexConfig = readText(path.join(home, ".codex", "config.toml"));
  if (!codexConfig?.includes('[plugins."membase@plugins-cli"]')) {
    failures.push("codex: config.toml must enable membase@plugins-cli");
  }
  const agentsMarketplace = readJson(path.join(home, ".agents", "plugins", "marketplace.json"));
  const codexEntry = agentsMarketplace?.plugins?.find?.((p) => p.name === "membase");
  if (!codexEntry) {
    failures.push("codex: ~/.agents/plugins/marketplace.json must list membase");
  } else {
    const codexDir = path.join(home, codexEntry.source.path.replace(/^\.\//, ""));
    const codexManifest = readJson(path.join(codexDir, ".codex-plugin", "plugin.json"));
    // The committed interface block must have blocked installer enrichment:
    // mcpServers stays the inline HTTP config, never a .mcp.json pointer
    // (which would resolve to the Claude-owned stdio config).
    if (codexManifest?.mcpServers?.membase?.url !== "https://mcp.membase.so/mcp") {
      failures.push("codex: .codex-plugin/plugin.json must keep the inline HTTP mcpServers");
    }
    if (!codexManifest?.interface?.displayName) {
      failures.push("codex: .codex-plugin/plugin.json must keep the committed interface block");
    }
    const codexHooks = readText(path.join(codexDir, "hooks", "hooks.json"));
    if (!codexHooks?.includes("${CODEX_PLUGIN_ROOT}/hooks/hook.cjs")) {
      failures.push("codex: hooks.json must be rewritten to ${CODEX_PLUGIN_ROOT} paths");
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("plugins CLI install smoke failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "plugins CLI install smoke passed (claude-code, cursor, codex from one root payload).",
);

function readJson(p) {
  const text = readText(p);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    failures.push(`${p}: invalid JSON`);
    return undefined;
  }
}

function readText(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    failures.push(`${p}: missing`);
    return undefined;
  }
}
