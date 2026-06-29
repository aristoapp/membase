#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_URL = "https://github.com/aristoapp/membase-plugin-mcp";

const files = {
  runtime: "docs/runtime-parity-decisions.md",
  deprecation: "docs/deprecation-plan.md",
  marketplace: "docs/marketplace-assets.md",
  review: "docs/review-summary.md"
};

const failures = [];
const content = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, readText(relativePath)])
);

assertIncludes(
  files.runtime,
  content.runtime,
  `| D1 | Final public repository URL and release path | \`${REPO_URL}\` is the accepted public repo path.`,
  "D1 must record the accepted public repository URL"
);
assertIncludes(
  files.runtime,
  content.runtime,
  "| Accepted by Jaehwan. |",
  "D1 must remain accepted before downstream launch handoff docs mark the URL ready"
);
assertIncludes(
  files.deprecation,
  content.deprecation,
  "- [x] Final public repository URL is confirmed.",
  "deprecation readiness must reflect accepted D1 public repo URL"
);
assertIncludes(
  files.deprecation,
  content.deprecation,
  "- [ ] First integrated release tag or launch branch is selected.",
  "release tag/branch must stay pending until explicitly selected"
);
assertIncludes(
  files.marketplace,
  content.marketplace,
  `| Repository | \`${REPO_URL}\` | Ready for review; release tag or bundle path remains a launch-time decision. |`,
  "marketplace repository row must match accepted D1 URL while keeping release path pending"
);
assertIncludes(
  files.review,
  content.review,
  "- Keep the accepted public repository URL and decide the remaining release/tag path.",
  "review summary must split accepted URL from pending release/tag choice"
);

for (const [relativePath, text] of Object.entries({
  [files.deprecation]: content.deprecation,
  [files.marketplace]: content.marketplace,
  [files.review]: content.review
})) {
  assertIncludes(
    relativePath,
    text,
    "No External Mutations",
    "launch handoff docs must keep the non-mutating boundary visible"
  );
}

if (failures.length > 0) {
  console.error("Launch handoff consistency check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Launch handoff consistency check passed.");

function readText(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    failures.push(`${relativePath}: unable to read file (${error.message})`);
    return "";
  }
}

function assertIncludes(relativePath, text, marker, message) {
  if (!text.includes(marker)) {
    failures.push(`${relativePath}: ${message}; missing ${JSON.stringify(marker)}`);
  }
}
