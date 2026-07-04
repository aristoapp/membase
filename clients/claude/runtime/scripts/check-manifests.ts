import { readFileSync } from "node:fs";

const claude = JSON.parse(
  readFileSync("plugin/.claude-plugin/plugin.json", "utf-8"),
);
const openPlugin = JSON.parse(
  readFileSync("plugin/.plugin/plugin.json", "utf-8"),
);
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const marketplace = JSON.parse(
  readFileSync(".claude-plugin/marketplace.json", "utf-8"),
);
const constants = readFileSync("src/constants.ts", "utf-8");

function constantValue(name: string): string | undefined {
  return constants.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
}

const fields = [
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "skills",
  "commands",
  "agents",
  "hooks",
  "mcpServers",
];
const mismatches = fields.filter(
  (field) =>
    JSON.stringify(claude[field]) !== JSON.stringify(openPlugin[field]),
);

if (mismatches.length > 0) {
  console.error(`Manifest drift detected: ${mismatches.join(", ")}`);
  process.exit(1);
}

if (claude.version !== pkg.version) {
  console.error(
    `Version drift detected: package.json=${pkg.version}, plugin.json=${claude.version}`,
  );
  process.exit(1);
}

if (constantValue("PLUGIN_VERSION") !== pkg.version) {
  console.error(
    "Version drift detected between package.json and src/constants.ts",
  );
  process.exit(1);
}

if (constantValue("DEFAULT_API_URL") !== claude.userConfig?.apiUrl?.default) {
  console.error(
    "API URL drift detected between plugin manifest and src/constants.ts",
  );
  process.exit(1);
}

const marketplacePlugin = marketplace.plugins?.find(
  (plugin: Record<string, unknown>) => plugin.name === claude.name,
);

if (!marketplacePlugin || marketplacePlugin.version !== claude.version) {
  console.error("Marketplace plugin entry is missing or version drifted.");
  process.exit(1);
}
