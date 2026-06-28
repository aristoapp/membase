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
  "docs/marketplace-assets.md",
  "docs/deprecation-plan.md",
  "packages/core/src/index.ts",
  "packages/connector-sdk/src/index.ts",
  "smoke/client-smoke.mjs",
  "smoke/public-contract-stub.mjs",
  "scripts/check-generated-artifacts.mjs",
  "scripts/check-secret-hygiene.mjs",
  "scripts/check-public-surface.sh"
];

const clientReadiness = [
  {
    id: "claude",
    files: [
      "clients/claude/src/index.ts",
      "clients/claude/README.md",
      "clients/claude/package.json",
      "clients/claude/.claude-plugin/plugin.json",
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
      "clients/cursor/.cursor-plugin/plugin.json",
      "clients/cursor/mcp.json",
      "manifests/cursor/plugin.json",
      "manifests/cursor/mcp.json",
      "docs/install/cursor.md"
    ]
  },
  {
    id: "hermes",
    files: [
      "clients/hermes/src/index.ts",
      "clients/hermes/README.md",
      "clients/hermes/package.json",
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
      "docs/marketplace-assets.md",
      "docs/deprecation-plan.md"
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
      "Secret Handling"
    ]
  },
  {
    path: "docs/migration-parity.md",
    markers: ["Claude", "Cursor", "Hermes", "OpenClaw", "Still to migrate or decide"]
  },
  {
    path: "docs/test-coverage-parity.md",
    markers: ["Current Integrated Coverage", "Next Test Work"]
  },
  {
    path: "docs/security.md",
    markers: ["MEMBASE_API_KEY", "redacted", "Live client-to-MCP smoke"]
  },
  {
    path: "docs/marketplace-assets.md",
    markers: ["Before any marketplace submission review", "pnpm check", "pnpm smoke:execute"]
  },
  {
    path: "docs/deprecation-plan.md",
    markers: ["non-mutating review plan", "archive", "star"]
  }
];

const installDocMarkers = [
  "MEMBASE_API_KEY",
  "pnpm check",
  "pnpm smoke:execute",
  "Review Checklist",
  "No public artifact describes Membase storage, graph, embedding, ranking"
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
    "smoke/client-smoke.mjs",
    "secret-hygiene",
    "public-surface",
    "review-readiness"
  ]) {
    if (!checkScript.includes(command)) {
      failures.push(`package.json: scripts.check does not include ${command}`);
    }
  }
}
