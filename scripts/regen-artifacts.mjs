#!/usr/bin/env node
// One-shot regeneration of committed client/manifest artifacts from adapter output.
// Mirrors the target list and formatting of scripts/check-generated-artifacts.mjs.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Root package.json is the single version source for every generated manifest.
const ROOT_VERSION = JSON.parse(
  await readFile(path.join(ROOT_DIR, "package.json"), "utf8")
).version;

const adapterSpecs = [
  {
    modulePath: "clients/claude/dist/index.js",
    defineRuntimeConfig: "defineClaudeRuntimeConfig",
    generateArtifacts: "generateClaudeArtifacts",
    targets: [
      { path: ".claude-plugin/plugin.json", format: "json", pick: (a) => a.plugin },
      { path: ".claude-plugin/marketplace.json", format: "json", pick: (a) => a.marketplace },
      { path: ".mcp.json", format: "json", pick: (a) => a.mcp }
    ]
  },
  {
    modulePath: "clients/cursor/dist/index.js",
    defineRuntimeConfig: "defineCursorRuntimeConfig",
    generateArtifacts: "generateCursorArtifacts",
    targets: [
      { path: ".cursor-plugin/plugin.json", format: "json", pick: (a) => a.plugin },
      { path: "mcp.json", format: "json", pick: (a) => a.mcp }
    ]
  },
  {
    modulePath: "clients/codex/dist/index.js",
    defineRuntimeConfig: "defineCodexRuntimeConfig",
    generateArtifacts: "generateCodexArtifacts",
    targets: [
      { path: ".plugin/plugin.json", format: "json", pick: (a) => a.plugin }
    ]
  },
  {
    modulePath: "clients/hermes/dist/index.js",
    defineRuntimeConfig: "defineHermesRuntimeConfig",
    generateArtifacts: "generateHermesArtifacts",
    targets: [
      { path: "clients/hermes/plugin/plugin.yaml", format: "hermes-plugin-yaml", pick: (a) => a.plugin },
      { path: "clients/hermes/mcp.json", format: "json", pick: (a) => a.mcp },
      { path: "manifests/hermes/plugin.yaml", format: "hermes-plugin-yaml", pick: (a) => a.plugin },
      { path: "manifests/hermes/mcp.json", format: "json", pick: (a) => a.mcp }
    ]
  },
  {
    modulePath: "clients/openclaw/dist/index.js",
    defineRuntimeConfig: "defineOpenClawRuntimeConfig",
    generateArtifacts: "generateOpenClawArtifacts",
    targets: [
      { path: "clients/openclaw/openclaw.plugin.json", format: "json", pick: (a) => a.plugin },
      { path: "clients/openclaw/mcp.json", format: "json", pick: (a) => a.mcp },
      { path: "manifests/openclaw/plugin.json", format: "json", pick: (a) => a.plugin },
      { path: "manifests/openclaw/mcp.json", format: "json", pick: (a) => a.mcp }
    ]
  }
];

let written = 0;
for (const spec of adapterSpecs) {
  const mod = await import(pathToFileURL(path.join(ROOT_DIR, spec.modulePath)).href);
  const artifacts = mod[spec.generateArtifacts](
    mod[spec.defineRuntimeConfig]({ version: ROOT_VERSION })
  );
  for (const target of spec.targets) {
    await writeFile(path.join(ROOT_DIR, target.path), formatArtifact(target.pick(artifacts), target.format), "utf8");
    written += 1;
  }
}

console.log(`Regenerated ${written} artifact files.`);

function formatArtifact(value, format) {
  if (format === "json") return `${JSON.stringify(value, null, 2)}\n`;
  if (format === "hermes-plugin-yaml") return formatHermesPluginYaml(value);
  throw new Error(`Unsupported format: ${format}`);
}

function formatHermesPluginYaml(manifest) {
  return `${[
    `name: ${manifest.name}`,
    `version: ${manifest.version}`,
    `description: ${JSON.stringify(manifest.description)}`,
    "pip_dependencies:",
    ...manifest.pip_dependencies.map((d) => `  - ${d}`)
  ].join("\n")}\n`;
}
