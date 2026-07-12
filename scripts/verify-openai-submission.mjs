#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checks = {
  passed: [],
  warnings: [],
  failed: []
};

async function verify() {
  console.log("=== OpenAI Plugin Submission Verification ===\n");

  // 1. Manifest validation
  console.log("1️⃣  Manifest Validation");
  checkManifest();

  // 2. Version parity
  console.log("\n2️⃣  Version Parity");
  checkVersionParity();

  // 3. Logo verification
  console.log("\n3️⃣  Logo Verification");
  checkLogo();

  // 4. Documentation completeness
  console.log("\n4️⃣  Documentation Completeness");
  checkDocumentation();

  // 5. MCP server connectivity (async)
  console.log("\n5️⃣  MCP Server Connectivity");
  await checkMcpServer();

  // 6. URL accessibility
  console.log("\n6️⃣  URL Accessibility");
  await checkUrls();

  // Summary
  console.log("\n=== Summary ===");
  console.log(`✅ Passed: ${checks.passed.length}`);
  console.log(`⚠️  Warnings: ${checks.warnings.length}`);
  console.log(`❌ Failed: ${checks.failed.length}`);

  if (checks.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of checks.warnings) {
      console.log(`  ⚠️  ${w}`);
    }
  }

  if (checks.failed.length > 0) {
    console.log("\nFailed Checks:");
    for (const f of checks.failed) {
      console.log(`  ❌ ${f}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Ready for OpenAI submission!");
}

function checkManifest() {
  const manifestPath = path.join(ROOT_DIR, ".openai-plugin/plugin.json");

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    const required = ["name", "version", "description", "mcpServers"];
    for (const field of required) {
      if (manifest[field]) {
        checks.passed.push(`Manifest has '${field}'`);
      } else {
        checks.failed.push(`Manifest missing '${field}'`);
      }
    }

    // Check MCP server URL
    const mcpUrl = manifest.mcpServers?.membase?.url;
    if (mcpUrl === "https://mcp.membase.so/mcp") {
      checks.passed.push("MCP server URL correct");
    } else {
      checks.failed.push(`MCP server URL invalid: ${mcpUrl}`);
    }

    // Check interface
    if (manifest.interface?.logo) {
      checks.passed.push(`Interface logo configured: ${manifest.interface.logo}`);
    } else {
      checks.failed.push("Interface logo missing");
    }

    if (manifest.interface?.externalURL) {
      checks.passed.push(`External URL configured: ${manifest.interface.externalURL}`);
    } else {
      checks.failed.push("Interface externalURL missing");
    }

  } catch (error) {
    checks.failed.push(`Failed to read manifest: ${error.message}`);
  }
}

function checkVersionParity() {
  const packagePath = path.join(ROOT_DIR, "package.json");
  const manifestPath = path.join(ROOT_DIR, ".openai-plugin/plugin.json");

  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    if (pkg.version === manifest.version) {
      checks.passed.push(`Version parity: both at ${pkg.version}`);
    } else {
      checks.failed.push(
        `Version mismatch: package.json=${pkg.version}, plugin.json=${manifest.version}`
      );
    }
  } catch (error) {
    checks.failed.push(`Failed to check versions: ${error.message}`);
  }
}

function checkLogo() {
  const logoPath = path.join(ROOT_DIR, ".openai-plugin/Membase-white.png");

  try {
    const stat = fs.statSync(logoPath);
    if (stat.isFile()) {
      const size = stat.size;
      checks.passed.push(`Logo file exists (${(size / 1024).toFixed(1)}KB)`);
    } else {
      checks.failed.push("Logo is not a regular file");
    }
  } catch (error) {
    checks.failed.push(`Logo file missing: ${error.message}`);
  }
}

function checkDocumentation() {
  const required = [
    "docs/OPENAI-TEST-CASES.md",
    "docs/OPENAI-STARTER-PROMPTS.md",
    "docs/OPENAI-DOMAIN-VERIFICATION.md",
    "docs/OPENAI-TOOL-METADATA.md"
  ];

  for (const doc of required) {
    const docPath = path.join(ROOT_DIR, doc);
    try {
      const stat = fs.statSync(docPath);
      if (stat.isFile()) {
        checks.passed.push(`${doc} exists`);
      } else {
        checks.failed.push(`${doc} is not a file`);
      }
    } catch {
      checks.failed.push(`${doc} missing`);
    }
  }
}

async function checkMcpServer() {
  const mcpUrl = "https://mcp.membase.so/mcp";

  return new Promise((resolve) => {
    const request = https.get(mcpUrl, { timeout: 5000 }, (response) => {
      if (response.statusCode >= 200 && response.statusCode < 500) {
        checks.passed.push(`MCP server responds (${response.statusCode})`);
      } else {
        checks.warnings.push(`MCP server returned status ${response.statusCode}`);
      }
      response.resume();
      resolve();
    });

    request.on("error", (error) => {
      checks.warnings.push(`Could not reach MCP server: ${error.message}`);
      resolve();
    });

    request.on("timeout", () => {
      checks.warnings.push("MCP server connection timed out");
      request.destroy();
      resolve();
    });
  });
}

async function checkUrls() {
  const urls = {
    "Website": "https://membase.so",
    "Privacy Policy": "https://membase.so/privacy",
    "Terms of Service": "https://membase.so/terms"
  };

  for (const [name, url] of Object.entries(urls)) {
    await checkUrl(name, url);
  }
}

async function checkUrl(name, url) {
  return new Promise((resolve) => {
    const request = https.get(url, { timeout: 5000 }, (response) => {
      if (response.statusCode === 200) {
        checks.passed.push(`${name} URL accessible`);
      } else {
        checks.warnings.push(`${name} returned status ${response.statusCode}`);
      }
      response.resume();
      resolve();
    });

    request.on("error", (error) => {
      checks.warnings.push(`${name} unreachable: ${error.message}`);
      resolve();
    });

    request.on("timeout", () => {
      checks.warnings.push(`${name} connection timed out`);
      request.destroy();
      resolve();
    });
  });
}

verify().catch(error => {
  console.error("Verification failed:", error);
  process.exit(1);
});
