#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "README.md",
  "PLAN.md",
  "docs/architecture.md",
  "docs/adr/0001-integrated-connector-repo.md",
  "docs/migration-parity.md",
  "docs/test-coverage-parity.md",
  "docs/security.md",
  "docs/live-smoke-runbook.md",
  "docs/packaging-action-parity.md",
  "docs/marketplace-assets.md",
  "docs/deprecation-plan.md",
  "docs/runtime-parity-decisions.md",
  "docs/review-summary.md",
  "docs/context.html",
  "packages/core/src/index.ts",
  "packages/connector-sdk/src/index.ts",
  "smoke/README.md",
  "smoke/client-smoke.mjs",
  "smoke/live-smoke-preflight.mjs",
  "smoke/public-contract-stub.mjs",
  "scripts/check-core-contract.mjs",
  "scripts/check-generated-artifacts.mjs",
  "scripts/check-claude-plugin-parity.mjs",
  "scripts/check-claude-native-artifacts.mjs",
  "scripts/check-cursor-transport-parity.mjs",
  "scripts/check-cursor-native-artifacts.mjs",
  "scripts/check-hermes-native-artifacts.mjs",
  "scripts/check-hermes-python-parity.mjs",
  "scripts/check-launch-handoff-consistency.mjs",
  "scripts/check-openclaw-native-artifacts.mjs",
  "scripts/check-openclaw-native-parity.mjs",
  "scripts/check-packaging-action-parity.mjs",
  "scripts/check-secret-hygiene.mjs",
  "scripts/check-runtime-decision-ledger.mjs",
  "scripts/check-version-parity.mjs",
  "scripts/check-public-surface.sh"
];

const clientReadiness = [
  {
    id: "claude",
    files: [
      "clients/claude/src/index.ts",
      "clients/claude/README.md",
      "clients/claude/package.json",
      "clients/claude/native-artifacts.json",
      "clients/claude/.claude-plugin/plugin.json",
      "clients/claude/.mcp.json",
      "manifests/claude/plugin.json",
      "manifests/claude/mcp.json",
      "docs/install/claude.md"
    ]
  },
  {
    id: "cursor",
    files: [
      "clients/cursor/src/index.ts",
      "clients/cursor/README.md",
      "clients/cursor/package.json",
      "clients/cursor/native-artifacts.json",
      "clients/cursor/.cursor-plugin/plugin.json",
      "clients/cursor/mcp.json",
      "manifests/cursor/plugin.json",
      "manifests/cursor/mcp.json",
      "docs/install/cursor.md"
    ]
  },
  {
    id: "codex",
    files: [
      "clients/codex/src/index.ts",
      "clients/codex/README.md",
      "clients/codex/package.json",
      "clients/codex/.codex-plugin/plugin.json",
      "clients/codex/.mcp.json",
      "manifests/codex/plugin.json",
      "manifests/codex/mcp.json",
      "docs/install/codex.md"
    ]
  },
  {
    id: "hermes",
    files: [
      "clients/hermes/src/index.ts",
      "clients/hermes/README.md",
      "clients/hermes/package.json",
      "clients/hermes/native-artifacts.json",
      "clients/hermes/python/README.md",
      "clients/hermes/python/pyproject.toml",
      "clients/hermes/python/src/membase_hermes/__init__.py",
      "clients/hermes/python/src/membase_hermes/cli.py",
      "clients/hermes/python/src/membase_hermes/installer.py",
      "clients/hermes/python/src/membase_hermes/provider.py",
      "clients/hermes/python/src/membase_hermes/plugin/__init__.py",
      "clients/hermes/python/src/membase_hermes/plugin/cli.py",
      "clients/hermes/python/src/membase_hermes/plugin/plugin.yaml",
      "clients/hermes/plugin/plugin.yaml",
      "clients/hermes/mcp.json",
      "manifests/hermes/plugin.yaml",
      "manifests/hermes/mcp.json",
      "docs/install/hermes.md"
    ]
  },
  {
    id: "openclaw",
    files: [
      "clients/openclaw/src/index.ts",
      "clients/openclaw/README.md",
      "clients/openclaw/package.json",
      "clients/openclaw/native-artifacts.json",
      "clients/openclaw/openclaw.plugin.json",
      "clients/openclaw/mcp.json",
      "manifests/openclaw/plugin.json",
      "manifests/openclaw/mcp.json",
      "docs/install/openclaw.md"
    ]
  }
];

const documentMarkers = [
  {
    path: "README.md",
    markers: [
      "docs/architecture.md",
      "docs/install/claude.md",
      "docs/install/cursor.md",
      "docs/install/hermes.md",
      "docs/install/openclaw.md",
      "docs/migration-parity.md",
      "docs/test-coverage-parity.md",
      "docs/security.md",
      "docs/live-smoke-runbook.md",
      "docs/packaging-action-parity.md",
      "docs/marketplace-assets.md",
      "docs/deprecation-plan.md",
      "docs/runtime-parity-decisions.md",
      "docs/review-summary.md"
    ]
  },
  {
    path: "docs/architecture.md",
    markers: [
      "Current Decision",
      "Public Capability Contract",
      "Client Adapter Status",
      "Migration Parity Status",
      "Client Smoke Harness",
      "Live MCP Smoke Runbook",
      "Live Smoke Preflight",
      "Packaging and Action Parity",
      "Runtime Parity Decision Ledger",
      "Linear-Ready Summary",
      "Secret Handling"
    ]
  },
  {
    path: "docs/migration-parity.md",
    markers: ["Claude", "Cursor", "Hermes", "OpenClaw", "Packaging and Action Parity", "Claude native artifact snapshot", "Hermes native artifact snapshot", "OpenClaw native artifact snapshot", "Still to migrate or decide"]
  },
  {
    path: "docs/test-coverage-parity.md",
    markers: ["Current Integrated Coverage", "Packaging and Action Parity", "Claude native artifact snapshot", "Hermes native artifact snapshot", "OpenClaw native artifact snapshot", "Next Test Work"]
  },
  {
    path: "docs/packaging-action-parity.md",
    markers: ["Claude Code", "Cursor", "Hermes Agent", "OpenClaw", "pnpm claude:plugin-parity", "pnpm claude:native-artifacts", "pnpm cursor:transport-parity", "pnpm cursor:native-artifacts", "pnpm hermes:python-parity", "pnpm hermes:native-artifacts", "pnpm openclaw:native-artifacts", "pnpm openclaw:native-parity", "Non-Mutating Boundary"]
  },
  {
    path: "docs/security.md",
    markers: ["user-supplied API key", "redacted", "Live client-to-MCP smoke"]
  },
  {
    path: "docs/live-smoke-runbook.md",
    markers: [
      "Live MCP Smoke Runbook",
      "Required Inputs",
      "Live Smoke Contract",
      "Test Data Shape",
      "Redaction Requirements",
      "pnpm smoke:live:preflight",
      "Non-Mutating Boundary"
    ]
  },
  {
    path: "smoke/README.md",
    markers: [
      "pnpm smoke:live:preflight",
      "D2",
      "D3",
      "Live client-to-MCP smoke coverage is intentionally pending"
    ]
  },
  {
    path: "docs/marketplace-assets.md",
    markers: ["Before any marketplace submission review", "pnpm check", "pnpm smoke:execute", "No External Mutations"]
  },
  {
    path: "docs/deprecation-plan.md",
    markers: ["non-mutating review plan", "archive", "star", "No External Mutations"]
  },
  {
    path: "docs/runtime-parity-decisions.md",
    markers: [
      "Runtime Parity Decision Ledger",
      "Decision Rules",
      "Decision Ledger",
      "Verification Gate",
      "No External Mutations"
    ]
  },
  {
    path: "docs/review-summary.md",
    markers: [
      "Linear-Ready Summary",
      "Definition of Done Mapping",
      "Remaining Review Decisions",
      "No External Mutations"
    ]
  },
  {
    path: "docs/context.html",
    markers: [
      "Context Board",
      "Last updated:",
      "Current Implementation Status",
      "docs/live-smoke-runbook.md",
      "GitHub sync:",
      "docs/runtime-parity-decisions.md"
    ]
  }
];

const installDocMarkers = [
  "No raw token or API key appears",
  "pnpm check",
  "pnpm smoke:execute",
  "Review Checklist",
  "No public artifact describes Membase storage, graph, embedding, ranking"
];

const clientReadmeMarkers = [
  "Marketplace Asset Reuse",
  "pnpm generated-artifacts"
];

const failures = [];

for (const file of requiredFiles) {
  assertFileExists(file);
}

for (const client of clientReadiness) {
  for (const file of client.files) {
    assertFileExists(file, client.id);
  }

  assertMarkers(`docs/install/${client.id}.md`, installDocMarkers);
  assertMarkers(`clients/${client.id}/README.md`, clientReadmeMarkers);
}

for (const doc of documentMarkers) {
  assertMarkers(doc.path, doc.markers);
}

assertPackageCheckComposition();

if (failures.length > 0) {
  console.error("Review readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Review readiness check passed (${requiredFiles.length} shared files, ${clientReadiness.length} clients).`
);

function assertFileExists(relativePath, clientId) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    failures.push(
      clientId
        ? `${clientId}: missing required review file ${relativePath}`
        : `missing required review file ${relativePath}`
    );
  }
}

function assertMarkers(relativePath, markers) {
  const content = readText(relativePath);
  if (content === undefined) {
    return;
  }

  for (const marker of markers) {
    if (!content.includes(marker)) {
      failures.push(`${relativePath}: missing review marker ${JSON.stringify(marker)}`);
    }
  }
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

  const checkScript = packageJson?.scripts?.check;
  if (typeof checkScript !== "string") {
    failures.push("package.json: missing scripts.check");
    return;
  }

  for (const command of [
    "generated-artifacts",
    "core:contract",
    "smoke/client-smoke.mjs",
    "smoke:live:preflight",
      "runtime-decision-ledger",
      "launch-handoff",
      "packaging-action-parity",
    "version-parity",
    "claude:plugin-parity",
    "claude:native-artifacts",
    "cursor:transport-parity",
    "cursor:native-artifacts",
    "hermes:python-parity",
    "hermes:native-artifacts",
    "openclaw:native-artifacts",
    "openclaw:native-parity",
    "secret-hygiene",
    "public-surface",
    "review-readiness"
  ]) {
    if (!checkScript.includes(command)) {
      failures.push(`package.json: scripts.check does not include ${command}`);
    }
  }
}
