#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const scanRoots = [
  ".gitignore",
  "README.md",
  "RUN_LOG.md",
  "PLAN.md",
  "docs",
  "packages",
  "clients",
  "manifests",
  "scripts",
  "smoke",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "tsconfig.json"
];

const ignoredSegments = new Set([
  ".git",
  "node_modules",
  "dist"
]);

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".yaml",
  ".yml"
]);

const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:MEMBASE_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|NPM_TOKEN|API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*(["']?)(?!\$\{|<|your-|example|placeholder|dummy|test|smoke|redacted|process\.env)[^\s"']{8,}\1/gi
];

const violations = [];
const files = collectFiles(scanRoots);

for (const file of files) {
  const relative = path.relative(ROOT_DIR, file);
  const content = fs.readFileSync(file, "utf8");

  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    for (const _match of content.matchAll(pattern)) {
      violations.push(`${relative}: raw secret-looking token matched ${pattern.source}`);
    }
  }

  if (relative.endsWith(".json")) {
    validateJsonMcpEnv(relative, content);
  }
}

if (violations.length > 0) {
  console.error("Secret hygiene check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Secret hygiene check passed (${files.length} files scanned).`);

function collectFiles(roots) {
  const result = [];

  for (const root of roots) {
    const absolute = path.join(ROOT_DIR, root);
    if (!fs.existsSync(absolute)) {
      continue;
    }

    const stats = fs.statSync(absolute);
    if (stats.isDirectory()) {
      walk(absolute, result);
    } else if (isTextFile(absolute)) {
      result.push(absolute);
    }
  }

  return result.sort();
}

function walk(dir, result) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredSegments.has(entry.name)) {
      continue;
    }

    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, result);
    } else if (entry.isFile() && isTextFile(absolute)) {
      result.push(absolute);
    }
  }
}

function isTextFile(file) {
  return textExtensions.has(path.extname(file));
}

function validateJsonMcpEnv(relative, content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }

  const servers = parsed?.mcpServers;
  if (!servers || typeof servers !== "object") {
    return;
  }

  for (const [serverName, server] of Object.entries(servers)) {
    const env = server?.env;
    if (!env || typeof env !== "object") {
      continue;
    }

    for (const [key, value] of Object.entries(env)) {
      if (isSensitiveKey(key) && !isSafeSecretReference(value)) {
        violations.push(
          `${relative}: mcpServers.${serverName}.env.${key} must be an env reference or redacted placeholder`
        );
      }
    }
  }
}

function isSensitiveKey(key) {
  return /(?:API_)?KEY|TOKEN|SECRET|PASSWORD/i.test(key);
}

function isSafeSecretReference(value) {
  return typeof value === "string" && (
    value === "[redacted]" ||
    /^\$\{(?:env:)?[A-Z0-9_]+\}$/.test(value) ||
    /^<[^>]+>$/.test(value)
  );
}
