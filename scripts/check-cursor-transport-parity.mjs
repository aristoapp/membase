#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CURSOR_MCP_URL = "https://mcp.membase.so/mcp";

const configPaths = ["mcp.json"];

// Codex shares the HTTP-first contract, but its config is inlined in the
// generic manifest (the root .mcp.json belongs to the Claude stdio server).
const codexManifestPath = ".plugin/plugin.json";

const requiredDocMarkers = [
  {
    path: "docs/install/cursor.md",
    markers: [CURSOR_MCP_URL, "OAuth"]
  }
];

const failures = [];

for (const configPath of configPaths) {
  const config = readJson(configPath);
  const server = config?.mcpServers?.membase;

  if (!server || typeof server !== "object") {
    failures.push(`${configPath}: missing mcpServers.membase`);
    continue;
  }

  if (server.url !== CURSOR_MCP_URL) {
    failures.push(`${configPath}: expected ${CURSOR_MCP_URL}`);
  }

  if (!server.headers || typeof server.headers !== "object" || Array.isArray(server.headers)) {
    failures.push(`${configPath}: expected headers object`);
  }

  for (const forbiddenKey of ["type", "command", "args", "env"]) {
    if (Object.hasOwn(server, forbiddenKey)) {
      failures.push(`${configPath}: must not include ${forbiddenKey} for HTTP-first Cursor MCP`);
    }
  }
}

for (const doc of requiredDocMarkers) {
  const content = readText(doc.path);
  if (content === undefined) {
    continue;
  }

  for (const marker of doc.markers) {
    if (!content.includes(marker)) {
      failures.push(`${doc.path}: missing marker ${JSON.stringify(marker)}`);
    }
  }
}

const codexManifest = readJson(codexManifestPath);
const codexServer = codexManifest?.mcpServers?.membase;
if (!codexServer || typeof codexServer !== "object") {
  failures.push(`${codexManifestPath}: missing inline mcpServers.membase`);
} else {
  if (codexServer.url !== CURSOR_MCP_URL) {
    failures.push(`${codexManifestPath}: expected ${CURSOR_MCP_URL}`);
  }
  for (const forbiddenKey of ["type", "command", "args", "env"]) {
    if (Object.hasOwn(codexServer, forbiddenKey)) {
      failures.push(`${codexManifestPath}: must not include ${forbiddenKey} for HTTP-first Codex MCP`);
    }
  }
}
if (codexManifest && !codexManifest.interface) {
  failures.push(
    `${codexManifestPath}: interface block is required — without it, installer-side enrichment re-points mcpServers at the Claude-owned .mcp.json`
  );
}

assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("Cursor transport parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Cursor transport parity check passed.");

function readJson(relativePath) {
  const content = readText(relativePath);
  if (content === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    failures.push(`${relativePath}: invalid JSON (${error.message})`);
    return undefined;
  }
}

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
  } catch {
    failures.push(`${relativePath}: unable to read file`);
    return undefined;
  }
}

function assertPackageCheckComposition() {
  const packageJson = readJson("package.json");
  const cursorParityScript = packageJson?.scripts?.["cursor:transport-parity"];
  if (cursorParityScript !== "node scripts/check-cursor-transport-parity.mjs") {
    failures.push("package.json: scripts.cursor:transport-parity is missing or unexpected");
  }

  const checkScript = packageJson?.scripts?.check;
  if (typeof checkScript !== "string" || !checkScript.includes("cursor:transport-parity")) {
    failures.push("package.json: scripts.check does not include cursor:transport-parity");
  }
}
