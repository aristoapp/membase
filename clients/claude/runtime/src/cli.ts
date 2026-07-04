import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient } from "./api/client.js";
import { loginWithOAuth } from "./auth/oauth.js";
import {
  clearTokens,
  loadConfig,
  readTokens,
  saveConfig,
  writeTokens,
} from "./config/index.js";
import { DEFAULT_MCP_URL, PLUGIN_VERSION } from "./constants.js";
import { formatBundle, formatWikiDocument } from "./format/index.js";
import { resolveProjectSlug } from "./project/index.js";
import {
  looksSensitive,
  sanitizeMembaseText,
  truncateText,
} from "./sanitize/index.js";
import { flushSpool, pendingSpoolCount } from "./spool/index.js";

async function askCaptureConsent(): Promise<"off" | "summary"> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      "Enable summary auto-capture for tool and compact summaries? [Y/n] ",
    );
    return /^n/i.test(answer.trim()) ? "off" : "summary";
  } finally {
    rl.close();
  }
}

function printUsage(): void {
  console.log(`Membase Claude Code Plugin ${PLUGIN_VERSION}

Usage:
  membase login
  membase logout
  membase status
  membase recall <query>
  membase remember <text>
  membase wiki search <query>
  membase wiki add <title> -- <markdown>
  membase index-project <summary>
  membase project-config <slug|off|auto>
`);
}

function duplicateMcpConfigs(): string[] {
  const candidates = [
    join(homedir(), ".claude.json"),
    join(process.cwd(), ".mcp.json"),
  ];
  const matches: string[] = [];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf-8");
      const lower = raw.toLowerCase();
      const hasMembaseRemoteUrl = lower.includes(DEFAULT_MCP_URL);
      const hasLegacyMembaseRemote =
        lower.includes("membase") && lower.includes("mcp-remote");
      if (hasMembaseRemoteUrl || hasLegacyMembaseRemote) {
        matches.push(path);
      }
    } catch {}
  }
  return matches;
}

async function authedClient() {
  const config = loadConfig();
  const tokens = readTokens();
  if (!tokens) {
    throw new Error("Not logged in. Run /membase:login first.");
  }
  return {
    config,
    client: createClient(config.apiUrl, tokens, writeTokens),
  };
}

async function commandLogin(): Promise<void> {
  const config = loadConfig();
  console.log(`Opening Membase OAuth login (${config.apiUrl})...`);
  const tokens = await loginWithOAuth(config.apiUrl);
  writeTokens(tokens);
  const captureMode = await askCaptureConsent();
  saveConfig({ captureMode });
  const client = createClient(config.apiUrl, tokens, writeTokens);
  await client.registerConnection().catch(() => undefined);
  console.log("Membase connected.");
  console.log(`Auto-capture: ${captureMode}`);
}

async function commandStatus(): Promise<void> {
  const config = loadConfig();
  const tokens = readTokens();
  console.log(`Membase Claude Code Plugin ${PLUGIN_VERSION}`);
  console.log(`API: ${config.apiUrl}`);
  console.log(`Logged in: ${tokens ? "yes" : "no"}`);
  console.log(`Auto-recall: ${config.autoRecall}`);
  console.log(`Auto-wiki-recall: ${config.autoWikiRecall}`);
  console.log(`Auto-capture: ${config.captureMode}`);
  console.log(`Session-start context: ${config.sessionStartContext}`);
  console.log(`Pending capture spool: ${pendingSpoolCount()}`);
  console.log(
    `Project: ${resolveProjectSlug(process.cwd(), config) ?? "(none)"}`,
  );
  const duplicates = duplicateMcpConfigs();
  if (duplicates.length > 0) {
    console.log("");
    console.log("Potential existing remote Membase MCP config detected:");
    for (const path of duplicates) console.log(`  - ${path}`);
    console.log(
      "Remove duplicate remote MCP configs if you see duplicate Membase tools in Claude Code.",
    );
  }
  if (tokens) {
    const client = createClient(config.apiUrl, tokens, writeTokens);
    const result = await flushSpool(client, 20).catch((error) => ({
      flushed: 0,
      remaining: pendingSpoolCount(),
      error,
    }));
    if ("flushed" in result && result.flushed > 0) {
      console.log(`Flushed pending captures: ${result.flushed}`);
    }
    await client.recordUsage().catch(() => undefined);
  }
}

async function commandRecall(query: string): Promise<void> {
  const { config, client } = await authedClient();
  const project = resolveProjectSlug(process.cwd(), config);
  const [memories, wiki] = await Promise.all([
    client.searchMemory({ query, limit: 10, project }),
    config.autoWikiRecall
      ? client.searchWiki({ query, limit: 5 })
      : Promise.resolve([]),
  ]);
  if (memories.length === 0 && wiki.length === 0) {
    console.log("No Membase context found.");
    return;
  }
  for (const [index, memory] of memories.entries()) {
    console.log(formatBundle(memory, index));
    console.log("");
  }
  for (const [index, doc] of wiki.entries()) {
    console.log(formatWikiDocument(doc, index));
    console.log("");
  }
}

async function storeMemory(
  text: string,
  captureKind: "explicit" | "project_index",
): Promise<void> {
  const { config, client } = await authedClient();
  const project = resolveProjectSlug(process.cwd(), config);
  if (looksSensitive(text)) {
    throw new Error("Refusing to store content that looks like a secret.");
  }
  const content = sanitizeMembaseText(text);
  await client.ingestMemory({
    content,
    display_summary: truncateText(content, 180),
    project,
    metadata: {
      plugin: "claude-membase",
      plugin_version: PLUGIN_VERSION,
      capture_kind: captureKind,
      cwd: process.cwd(),
      project_slug: project ?? null,
    },
  });
  console.log("Stored in Membase.");
}

async function commandRemember(text: string): Promise<void> {
  await storeMemory(text, "explicit");
}

async function commandIndexProject(text: string): Promise<void> {
  await storeMemory(text, "project_index");
}

async function commandWiki(args: string[]): Promise<void> {
  const { client } = await authedClient();
  const action = args[0];
  if (action === "search") {
    const query = args.slice(1).join(" ");
    const docs = await client.searchWiki({ query, limit: 10 });
    for (const [index, doc] of docs.entries()) {
      console.log(formatWikiDocument(doc, index));
      console.log("");
    }
    return;
  }
  if (action === "add") {
    const separator = args.indexOf("--");
    const title = separator > 1 ? args.slice(1, separator).join(" ") : args[1];
    const content =
      separator > 1
        ? args.slice(separator + 1).join(" ")
        : args.slice(2).join(" ");
    if (!title || !content)
      throw new Error("Usage: membase wiki add <title> -- <markdown>");
    if (looksSensitive(content)) {
      throw new Error(
        "Refusing to store wiki content that looks like a secret.",
      );
    }
    const doc = await client.addWiki({ title, content });
    console.log(`Wiki document created: ${doc.title} (${doc.id})`);
    return;
  }
  throw new Error(
    "Usage: membase wiki search <query> | membase wiki add <title> -- <markdown>",
  );
}

function commandProjectConfig(value: string | undefined): void {
  if (!value) {
    console.log(
      `Current project: ${resolveProjectSlug(process.cwd(), loadConfig()) ?? "(none)"}`,
    );
    return;
  }
  if (value === "off") {
    saveConfig({ projectMode: "off", projectSlug: undefined });
  } else if (value === "auto") {
    saveConfig({ projectMode: "auto_git", projectSlug: undefined });
  } else {
    saveConfig({ projectMode: "manual", projectSlug: value });
  }
  console.log(
    `Project config updated: ${resolveProjectSlug(process.cwd(), loadConfig()) ?? "(none)"}`,
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }
  if (command === "login") return commandLogin();
  if (command === "logout") {
    clearTokens();
    saveConfig({ captureMode: "off" });
    console.log("Logged out of Membase.");
    return;
  }
  if (command === "status") return commandStatus();
  if (command === "recall") return commandRecall(args.join(" "));
  if (command === "remember") return commandRemember(args.join(" "));
  if (command === "wiki") return commandWiki(args);
  if (command === "index-project") return commandIndexProject(args.join(" "));
  if (command === "project-config") return commandProjectConfig(args[0]);
  printUsage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
