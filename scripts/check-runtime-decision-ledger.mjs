#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = "docs/runtime-parity-decisions.md";

const requiredDecisionRows = [
  {
    id: "D1",
    cells: [
      "Final public repository URL and release path",
      "accepted public repo path",
      "Release/tag naming remains a launch-time choice",
      "Accepted by Jaehwan"
    ]
  },
  {
    id: "D2",
    cells: [
      "Client runtime package or command path",
      "Finalized to `membase.so` with no user-supplied API key",
      "Claude plugin-local stdio",
      "remote HTTP MCP endpoint",
      "live API behavior pending"
    ]
  },
  {
    id: "D3",
    cells: [
      "Per-client transport precedence",
      "Finalized: Claude plugin-local stdio and Cursor/Hermes/OpenClaw remote HTTP MCP",
      "no user-supplied API key"
    ]
  },
  {
    id: "D4",
    cells: [
      "Client-native runtime parity scope",
      "Claude commands/hooks/skills copy",
      "Cursor rules/skills/assets copy",
      "Hermes live behavior",
      "OpenClaw hooks/tools copy"
    ]
  },
  {
    id: "D5",
    cells: [
      "Marketplace asset reuse",
      "Accepted direction",
      "asset files still pending"
    ]
  },
  {
    id: "D6",
    cells: [
      "Live client-to-MCP smoke gate",
      "live smoke remains pending",
      "test-only credentials",
      "cleanup behavior"
    ]
  }
];

const requiredMarkers = [
  "Linear project `Plugin/MCP 통합 레포 출시`",
  "Do not expose Membase storage, graph, embedding, ranking, or internal memory",
  "Treat every decision below as non-mutating until Jaehwan explicitly asks",
  "npm view @membase/mcp-server",
  "returned npm 404",
  "Claude plugin-local stdio",
  "Cursor HTTP MCP",
  "Hermes Python/native provider",
  "OpenClaw native extension",
  "No External Mutations",
  "does not publish packages, open pull requests, update Linear, submit marketplace listings, archive old repositories, or change GitHub repository state"
];

const forbiddenClaims = [
  "ready to publish",
  "publishing enabled",
  "marketplace submission enabled",
  "old repos archived",
  "linear updated",
  "smoke:live passed"
];

const failures = [];
const ledger = readText(LEDGER_PATH);

if (ledger !== undefined) {
  const normalizedLedger = normalizeWhitespace(ledger);

  for (const marker of requiredMarkers) {
    if (!normalizedLedger.includes(normalizeWhitespace(marker))) {
      failures.push(`${LEDGER_PATH}: missing required marker ${JSON.stringify(marker)}`);
    }
  }

  for (const decision of requiredDecisionRows) {
    const row = findDecisionRow(ledger, decision.id);
    if (row === undefined) {
      failures.push(`${LEDGER_PATH}: missing decision row ${decision.id}`);
      continue;
    }

    for (const marker of decision.cells) {
      if (!row.includes(marker)) {
        failures.push(`${LEDGER_PATH}: ${decision.id} row missing ${JSON.stringify(marker)}`);
      }
    }
  }

  const lowerLedger = ledger.toLowerCase();
  for (const claim of forbiddenClaims) {
    if (lowerLedger.includes(claim)) {
      failures.push(`${LEDGER_PATH}: contains premature claim ${JSON.stringify(claim)}`);
    }
  }
}

assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("Runtime decision ledger check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Runtime decision ledger check passed.");

function findDecisionRow(content, decisionId) {
  return content
    .split("\n")
    .find((line) => line.startsWith(`| ${decisionId} |`));
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

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

  const ledgerScript = packageJson?.scripts?.["runtime-decision-ledger"];
  if (ledgerScript !== "node scripts/check-runtime-decision-ledger.mjs") {
    failures.push("package.json: scripts.runtime-decision-ledger is missing or unexpected");
  }

  const checkScript = packageJson?.scripts?.check;
  if (typeof checkScript !== "string" || !checkScript.includes("runtime-decision-ledger")) {
    failures.push("package.json: scripts.check does not include runtime-decision-ledger");
  }

  if (typeof packageJson?.scripts?.["smoke:live"] === "string") {
    failures.push("package.json: smoke:live must stay undefined until D2/D3/D6 are accepted");
  }
}
