import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, parse } from "node:path";
import type { PluginConfig } from "../types.js";

export function normalizeProjectSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "-")
    .replace(/_{1,}/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function findGitRoot(cwd: string): string | null {
  let current = cwd;
  while (current && current !== parse(current).root) {
    if (existsSync(join(current, ".git"))) return current;
    current = dirname(current);
  }
  return null;
}

function remoteSlug(gitRoot: string): string | null {
  try {
    const gitConfig = readFileSync(join(gitRoot, ".git", "config"), "utf-8");
    const match = gitConfig.match(/url\s*=\s*(.+)\n/);
    if (!match?.[1]) return null;
    const value = match[1]
      .trim()
      .replace(/^git@[^:]+:/, "")
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/\.git$/, "");
    return normalizeProjectSlug(value);
  } catch {
    return null;
  }
}

export function resolveProjectSlug(
  cwd: string | undefined,
  config: PluginConfig,
): string | undefined {
  if (config.projectMode === "off") return undefined;
  if (config.projectSlug) return normalizeProjectSlug(config.projectSlug);
  if (config.projectMode === "manual") return undefined;
  if (!cwd) return undefined;
  const gitRoot = findGitRoot(cwd);
  if (gitRoot)
    return remoteSlug(gitRoot) || normalizeProjectSlug(basename(gitRoot));
  return normalizeProjectSlug(basename(cwd));
}
