#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC_PATH = "docs/packaging-action-parity.md";

const requiredMarkers = [
  "Packaging and Action Parity Map",
  "aristoapp/claude-membase",
  "bun run check",
  "validate:plugin",
  "validate:marketplace",
  "pnpm claude:plugin-parity",
  "pnpm claude:native-artifacts",
  "clients/claude/native-artifacts.json",
  "aristoapp/cursor-membase",
  "No old GitHub workflow was found",
  "HTTP MCP",
  "https://mcp.membase.so/mcp",
  "pnpm cursor:transport-parity",
  "pnpm cursor:native-artifacts",
  "clients/cursor/native-artifacts.json",
  "aristoapp/hermes-membase",
  "python -m build",
  "twine upload",
  "PyPI upload disabled",
  "pnpm hermes:python-parity",
  "pnpm hermes:native-artifacts",
  "clients/hermes/native-artifacts.json",
  "aristoapp/openclaw-membase",
  "bun run check-types",
  "bun run build",
  "pnpm openclaw:native-artifacts",
  "clients/openclaw/native-artifacts.json",
  "pnpm openclaw:native-parity",
  "Non-Mutating Boundary"
];

const forbiddenClaims = [
  "ready to publish",
  "publishing enabled",
  "marketplace submission enabled",
  "old repos archived"
];

const failures = [];
const content = readText(DOC_PATH);

if (content !== undefined) {
  for (const marker of requiredMarkers) {
    if (!content.includes(marker)) {
      failures.push(`${DOC_PATH}: missing marker ${JSON.stringify(marker)}`);
    }
  }

  const lowerContent = content.toLowerCase();
  for (const claim of forbiddenClaims) {
    if (lowerContent.includes(claim)) {
      failures.push(`${DOC_PATH}: contains premature external mutation claim ${JSON.stringify(claim)}`);
    }
  }
}

assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("Packaging/action parity check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Packaging/action parity check passed.");

function readText(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    failures.push(`${relativePath}: unable to read file`);
    return undefined;
  }
}

function assertPackageCheckComposition() {
  const packageJsonText = readText("package.json");
  if (packageJsonText === undefined) {
    return;
  }

  let packageJson;
  try {
    packageJson = JSON.parse(packageJsonText);
  } catch {
    failures.push("package.json: invalid JSON");
    return;
  }

  const parityScript = packageJson?.scripts?.["packaging-action-parity"];
  if (parityScript !== "node scripts/check-packaging-action-parity.mjs") {
    failures.push("package.json: scripts.packaging-action-parity is missing or unexpected");
  }

  const checkScript = packageJson?.scripts?.check;
  if (typeof checkScript !== "string" || !checkScript.includes("packaging-action-parity")) {
    failures.push("package.json: scripts.check does not include packaging-action-parity");
  }

  const claudeParityScript = packageJson?.scripts?.["claude:plugin-parity"];
  if (claudeParityScript !== "node scripts/check-claude-plugin-parity.mjs") {
    failures.push("package.json: scripts.claude:plugin-parity is missing or unexpected");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("claude:plugin-parity")) {
    failures.push("package.json: scripts.check does not include claude:plugin-parity");
  }

  const claudeNativeArtifactsScript = packageJson?.scripts?.["claude:native-artifacts"];
  if (claudeNativeArtifactsScript !== "node scripts/check-claude-native-artifacts.mjs") {
    failures.push("package.json: scripts.claude:native-artifacts is missing or unexpected");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("claude:native-artifacts")) {
    failures.push("package.json: scripts.check does not include claude:native-artifacts");
  }

  const openClawParityScript = packageJson?.scripts?.["openclaw:native-parity"];
  if (openClawParityScript !== "node scripts/check-openclaw-native-parity.mjs") {
    failures.push("package.json: scripts.openclaw:native-parity is missing or unexpected");
  }

  const openClawNativeArtifactsScript = packageJson?.scripts?.["openclaw:native-artifacts"];
  if (openClawNativeArtifactsScript !== "node scripts/check-openclaw-native-artifacts.mjs") {
    failures.push("package.json: scripts.openclaw:native-artifacts is missing or unexpected");
  }

  const cursorParityScript = packageJson?.scripts?.["cursor:transport-parity"];
  if (cursorParityScript !== "node scripts/check-cursor-transport-parity.mjs") {
    failures.push("package.json: scripts.cursor:transport-parity is missing or unexpected");
  }

  const cursorNativeArtifactsScript = packageJson?.scripts?.["cursor:native-artifacts"];
  if (cursorNativeArtifactsScript !== "node scripts/check-cursor-native-artifacts.mjs") {
    failures.push("package.json: scripts.cursor:native-artifacts is missing or unexpected");
  }

  const hermesParityScript = packageJson?.scripts?.["hermes:python-parity"];
  if (hermesParityScript !== "node scripts/check-hermes-python-parity.mjs") {
    failures.push("package.json: scripts.hermes:python-parity is missing or unexpected");
  }

  const hermesNativeArtifactsScript = packageJson?.scripts?.["hermes:native-artifacts"];
  if (hermesNativeArtifactsScript !== "node scripts/check-hermes-native-artifacts.mjs") {
    failures.push("package.json: scripts.hermes:native-artifacts is missing or unexpected");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("openclaw:native-parity")) {
    failures.push("package.json: scripts.check does not include openclaw:native-parity");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("openclaw:native-artifacts")) {
    failures.push("package.json: scripts.check does not include openclaw:native-artifacts");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("cursor:transport-parity")) {
    failures.push("package.json: scripts.check does not include cursor:transport-parity");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("cursor:native-artifacts")) {
    failures.push("package.json: scripts.check does not include cursor:native-artifacts");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("hermes:python-parity")) {
    failures.push("package.json: scripts.check does not include hermes:python-parity");
  }

  if (typeof checkScript !== "string" || !checkScript.includes("hermes:native-artifacts")) {
    failures.push("package.json: scripts.check does not include hermes:native-artifacts");
  }
}
