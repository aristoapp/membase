# ADR 0003 — Agents are descriptors, not implementations

Status: accepted (Jaehwan, 2026-07-05) · Refines ADR 0001's thin-shim rule and
mirrors the public docs taxonomy at docs.membase.so.

## Context

The public docs organize connectors exactly the way the product works:

- `/connectors/agents/*` — ten pages (ChatGPT, Claude Code, Claude custom
  connector, Codex, Cursor, Gemini CLI, **Generic MCP URL**, OpenCode, Poke,
  VS Code). Every one of these is "point this MCP host at
  `https://mcp.membase.so/mcp` + OAuth"; the existence of the *Generic MCP
  URL* page proves the capability is ONE thing. What varies per agent is pure
  packaging data: manifest format/filename, config file location, JSON vs
  TOML, one-click deeplink vs CLI command, optional rules/skills extras.
- `/connectors/{openclaw,hermes}` — the two embedded-runtime connectors with
  real client-side behavior (providers, hooks, capture).

The repo today hand-writes a ~122-line adapter per agent and covers only 2 of
the 10 documented agents (cursor, codex). The measured difference between
those two adapters is 81 lines — all declarative data, zero behavior. Scaling
this pattern to ten agents means ten near-identical copies; the structure
fights the docs taxonomy instead of mirroring it.

## Decision

### 1. Refine the ADR 0001 rule

> Separate what BEHAVES differently; collapse into data what only DIFFERS in
> data.

- **Behavioral variance** (runtimes: Claude Code plugin, OpenClaw plugin,
  Hermes provider) → stays per-client, per ADR 0001/0002.
- **Data variance** (all config-only agents) → one shared implementation +
  per-agent descriptors.

### 2. `defineMcpHostAgent(descriptor)` in connector-sdk

One implementation renders manifests/config/install docs/smoke decls from a
declarative descriptor:

```ts
defineMcpHostAgent({
  id: "codex",
  displayName: "Codex CLI",
  configFile: { path: "~/.codex/config.toml", format: "toml", key: "mcp_servers.membase" },
  manifest: { dir: ".codex-plugin", mcpConfigRef: ".mcp.json" },
  install: { cli: "codex mcp add membase --url https://mcp.membase.so/mcp" },
  extras: []
})
```

Cursor and Codex migrate to descriptors first — their committed
manifests/configs are golden-tested, so the migration must be byte-identical
(regen + `pnpm generated-artifacts` proves it). Rules/skills bundles (Cursor)
remain committed artifacts referenced by the descriptor's `extras`.

### 3. Coverage goal: every documented agent

The remaining documented agents (ChatGPT, Claude custom connector, Gemini
CLI, OpenCode, Poke, VS Code, Generic MCP URL) become descriptors + install
docs — each an entry of tens of lines, not a new implementation. The e2e
harness gains their configs the same way (`CLIENTS` entries pointing at
generated configs), so every documented path is CI-verified.

### 4. Repo layout: semantic tiers, no mass rename

Directories stay `clients/<id>` (guards, tsconfig references, and docs point
at them; a physical `clients/agents/*` move is churn without benefit). The
tiering is expressed by what a client contains:

- descriptor-only agent: `clients/<id>` = descriptor + committed generated
  artifacts (+ optional static extras like rules/skills);
- runtime client: additionally `runtime/` (claude, openclaw) or a language
  package (hermes/python).

Claude Code is the deliberate hybrid: it appears under Agents in the docs but
ships a runtime; its adapter can still become a descriptor while
`clients/claude/runtime` stays per ADR 0002.

## Consequences

- Adding the 8 missing documented agents stops being 8×122-line copies.
- A Membase server change (new URL, new OAuth shape) is one descriptor-schema
  change, propagated by regen to every agent's artifacts.
- The repo taxonomy finally matches the public docs: Agents (descriptors) /
  OpenClaw / Hermes (runtimes).

## Sequencing

- E1: descriptor mechanism in connector-sdk + migrate cursor/codex
  (byte-identical goldens).
- E2: add the seven remaining documented agents (descriptors + install docs +
  e2e configs).
- Independent of Group D (capture-core); either can land first. Both wait
  behind the north-star Gate 2 sign-off for publishing purposes but may merge
  to main before it.
