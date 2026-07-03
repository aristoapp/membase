#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const adapterSpecs = [
  {
    id: "claude",
    modulePath: "clients/claude/dist/index.js",
    defineRuntimeConfig: "defineClaudeRuntimeConfig",
    generateArtifacts: "generateClaudeArtifacts",
    targets: [
      {
        path: "clients/claude/.claude-plugin/plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "manifests/claude/plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "clients/claude/.mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      },
      {
        path: "manifests/claude/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      }
    ]
  },
  {
    id: "cursor",
    modulePath: "clients/cursor/dist/index.js",
    defineRuntimeConfig: "defineCursorRuntimeConfig",
    generateArtifacts: "generateCursorArtifacts",
    targets: [
      {
        path: "clients/cursor/.cursor-plugin/plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "clients/cursor/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      },
      {
        path: "manifests/cursor/plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "manifests/cursor/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      }
    ]
  },
  {
    id: "codex",
    modulePath: "clients/codex/dist/index.js",
    defineRuntimeConfig: "defineCodexRuntimeConfig",
    generateArtifacts: "generateCodexArtifacts",
    targets: [
      {
        path: "clients/codex/.codex-plugin/plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "clients/codex/.mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      },
      {
        path: "manifests/codex/plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "manifests/codex/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      }
    ]
  },
  {
    id: "hermes",
    modulePath: "clients/hermes/dist/index.js",
    defineRuntimeConfig: "defineHermesRuntimeConfig",
    generateArtifacts: "generateHermesArtifacts",
    targets: [
      {
        path: "clients/hermes/plugin/plugin.yaml",
        format: "hermes-plugin-yaml",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "clients/hermes/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      },
      {
        path: "manifests/hermes/plugin.yaml",
        format: "hermes-plugin-yaml",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "manifests/hermes/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      }
    ]
  },
  {
    id: "openclaw",
    modulePath: "clients/openclaw/dist/index.js",
    defineRuntimeConfig: "defineOpenClawRuntimeConfig",
    generateArtifacts: "generateOpenClawArtifacts",
    targets: [
      {
        path: "clients/openclaw/openclaw.plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "clients/openclaw/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      },
      {
        path: "manifests/openclaw/plugin.json",
        format: "json",
        pick: (artifacts) => artifacts.plugin
      },
      {
        path: "manifests/openclaw/mcp.json",
        format: "json",
        pick: (artifacts) => artifacts.mcp
      }
    ]
  }
];

let checkedFiles = 0;
let failedFiles = 0;

for (const spec of adapterSpecs) {
  const adapterModule = await importModule(spec.modulePath);
  const defineRuntimeConfig = adapterModule[spec.defineRuntimeConfig];
  const generateArtifacts = adapterModule[spec.generateArtifacts];

  if (typeof defineRuntimeConfig !== "function") {
    throw new TypeError(`${spec.modulePath} does not export ${spec.defineRuntimeConfig}`);
  }

  if (typeof generateArtifacts !== "function") {
    throw new TypeError(`${spec.modulePath} does not export ${spec.generateArtifacts}`);
  }

  const artifacts = generateArtifacts(defineRuntimeConfig());

  for (const target of spec.targets) {
    checkedFiles += 1;
    const artifact = target.pick(artifacts);
    const expected = formatArtifact(artifact, target.format);
    const actual = await readFile(path.join(ROOT_DIR, target.path), "utf8");

    if (actual !== expected) {
      failedFiles += 1;
      console.error(`Generated artifact is out of sync: ${target.path}`);
      console.error(`  source: ${spec.modulePath}`);
      console.error(`  ${describeFirstDifference(actual, expected)}`);
    }

    if (target.format === "json") {
      await validateRelativeAssetReferences(target.path, artifact);
    }
  }
}

if (failedFiles > 0) {
  console.error();
  console.error(
    `${failedFiles} generated artifact file(s) differ from adapter output.`
  );
  process.exit(1);
}

console.log(`Generated artifact check passed (${checkedFiles} files).`);

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT_DIR, relativePath)).href);
}

function formatArtifact(value, format) {
  if (format === "json") {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  if (format === "hermes-plugin-yaml") {
    return formatHermesPluginYaml(value);
  }

  throw new Error(`Unsupported artifact format: ${format}`);
}

function formatHermesPluginYaml(manifest) {
  return [
    `name: ${manifest.name}`,
    `version: ${manifest.version}`,
    `description: ${JSON.stringify(manifest.description)}`,
    "pip_dependencies:",
    ...manifest.pip_dependencies.map((dependency) => `  - ${dependency}`)
  ].join("\n") + "\n";
}

function describeFirstDifference(actual, expected) {
  const length = Math.min(actual.length, expected.length);
  let index = 0;

  while (index < length && actual[index] === expected[index]) {
    index += 1;
  }

  if (index === length && actual.length !== expected.length) {
    return `first difference at byte ${index}: file length ${actual.length}, expected ${expected.length}`;
  }

  const line = actual.slice(0, index).split("\n").length;
  return `first difference at byte ${index}, line ${line}`;
}

async function validateRelativeAssetReferences(targetPath, artifact) {
  if (!artifact || typeof artifact !== "object") {
    return;
  }

  for (const field of ["icon", "logo"]) {
    const value = artifact[field];
    if (typeof value !== "string" || !isRelativeAssetReference(value)) {
      continue;
    }

    const assetPath = path.join(ROOT_DIR, path.dirname(targetPath), value);
    try {
      await access(assetPath);
    } catch {
      failedFiles += 1;
      console.error(`Manifest asset is missing: ${targetPath} -> ${value}`);
    }
  }
}

function isRelativeAssetReference(value) {
  return !/^(?:https?:|data:|\/)/i.test(value);
}
