# Membase Plugin/MCP

**The official connector kit for plugging [Membase](https://membase.so) into your AI clients.**

[![CI](https://github.com/aristoapp/membase-plugin-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aristoapp/membase-plugin-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Membase is a persistent memory layer for AI agents — a shared store that
survives across sessions, tools, and platforms so your agents remember what
matters. This repository is the **integration surface**: it gives editors,
CLIs, and MCP-capable agents a consistent, secure way to connect to Membase.

Instead of a separate plugin repo per client, every connector lives here behind
one shared core, one auth model, and one small public contract.

> **Status:** actively developed, pre-1.0. The public connector contract
> (`remember` / `search` / `getContext` / `deleteOrForget`) is stable; client
> runtimes and packaging are still maturing. Expect changes before a tagged
> release.

## Table of contents

- [Why Membase](#why-membase)
- [Quick start](#quick-start)
- [Supported clients](#supported-clients)
- [What you get](#what-you-get)
- [Use cases](#use-cases)
- [Example prompts](#example-prompts)
- [How it works](#how-it-works)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Why Membase

Most AI tools forget everything the moment a chat ends. Context you've already
explained — your stack, your preferences, decisions you made last week — has to
be re-explained every session, and it never carries across to a different tool.

**With Membase**, your agents share one persistent memory:

- **Remembers across sessions** — no re-explaining the same context every time.
- **Shared across tools** — the same memory in Claude Code, Cursor, Codex, and more.
- **Private by design** — connectors expose a tiny capability surface; your
  memory engine stays behind Membase's API, never in this repo.
- **No API keys to manage** — auth is handled through Membase's OAuth login.

## Quick start

The fastest path is the hosted (remote) Membase MCP server. Any MCP-capable
host can point at it and authorize over OAuth on first use:

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

One-click install for popular editors:

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=membase&config=eyJ1cmwiOiJodHRwczovL21jcC5tZW1iYXNlLnNvL21jcCJ9)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=membase&config=%7B%22type%22%3A%20%22http%22%2C%20%22url%22%3A%20%22https%3A%2F%2Fmcp.membase.so%2Fmcp%22%7D)

For the precise file, field names, and any native (non-remote) integration, use
the per-client guide for your tool below.

## Supported clients

| Client | Integration | Install guide |
| --- | --- | --- |
| **Claude Code** | Plugin with a bundled (stdio) MCP server | [docs/install/claude.md](docs/install/claude.md) |
| **Cursor** | Remote HTTP MCP server + OAuth | [docs/install/cursor.md](docs/install/cursor.md) |
| **Codex CLI** | Remote HTTP MCP server + OAuth | [docs/install/codex.md](docs/install/codex.md) |
| **Hermes Agent** | Native Python provider + MCP config | [docs/install/hermes.md](docs/install/hermes.md) |
| **OpenClaw** | Native plugin (TypeScript) + MCP config | [docs/install/openclaw.md](docs/install/openclaw.md) |

Any other MCP-capable host (ChatGPT, Gemini CLI, VS Code, OpenCode, Poke, or a
generic MCP URL) can connect using the remote server shown in
[Quick start](#quick-start) plus the OAuth prompt on first use.

## What you get

Every connector exposes the same small, stable capability set — nothing about
Membase's internal memory engine leaks through:

| Capability | What it does |
| --- | --- |
| `remember` | Save a memory or observation to your Membase store |
| `search` | Retrieve the most relevant memories for a query |
| `getContext` | Pull task-relevant context for the current work |
| `deleteOrForget` | Remove or forget a memory |

Authentication is handled for you: **there is no user-supplied API key**.
Interactive clients authenticate through Membase's OAuth login flow, and
headless/CI environments use a `client_credentials` service token. Configs only
ever reference environment variables — never secret values.

## Use cases

- **Persistent project context** — your agent remembers your stack, conventions,
  and past decisions instead of asking again every session.
- **Cross-tool continuity** — capture something in Claude Code and recall it in
  Cursor or Codex, because they share one memory.
- **Long-running work** — pick up a multi-day task with the relevant history
  pulled back into context automatically.
- **Personal knowledge** — save facts, preferences, and notes once and let any
  connected agent retrieve them on demand.

## Example prompts

Once a connector is installed, memory works through natural language — the agent
calls the tools for you:

```txt
Remember that we deploy from the release branch, never from main.
```

```txt
What did we decide about the auth flow last week?
```

```txt
Save this: the staging database resets every night at 02:00 UTC.
```

## How it works

Connectors talk to a stable Membase Context API. Membase owns storage, ranking,
freshness, provenance, and governance behind that API — this repo never exposes
those internals.

```text
Client plugin or MCP config      ← per-client adapter (clients/*)
        │
        ▼
Shared connector core            ← packages/core, packages/connector-sdk
        │
        ▼
Membase Context API              ← stable public surface
        │
        ▼
Private Membase memory engine    ← storage, graph, ranking (not in this repo)
```

Dependencies point downward only. Client-specific behavior stays in
`clients/*`; shared behavior lives in `packages/*`. A CI guard fails the build
if any internal Membase term (storage schema, graph, embeddings, ranking) leaks
into the public surface.

> **Note:** This repository is the connector/integration layer only. The
> Membase Context API, memory engine, and their supporting services are a
> separate, private system and are not part of this repo.

For the full design rationale, see [docs/architecture.md](docs/architecture.md)
and the decision records in [docs/adr/](docs/adr/).

## Repository layout

```text
packages/core/            Auth, endpoint, and MCP-config primitives (client-safe only)
packages/connector-sdk/   Public SDK for adding new connectors (ClientAdapter, defineMcpHostAgent)
packages/capture-core/    Shared capture runtime: sanitize, spool, OAuth transport
clients/claude/           Claude Code plugin adapter + bundled runtime
clients/cursor/           Cursor MCP adapter
clients/codex/            Codex CLI MCP adapter
clients/hermes/           Hermes Agent adapter + native Python provider
clients/openclaw/         OpenClaw plugin adapter + native runtime
manifests/                Canonical generated plugin/MCP manifest examples
docs/install/             Per-client install guides
docs/adr/                 Architecture decision records
smoke/                    Connector-contract smoke tests
scripts/                  CI guards and artifact generation
```

A more detailed "where does X live" map is in [MAP.md](MAP.md).

## Development

This is a [pnpm](https://pnpm.io) monorepo. You'll need **Node.js 20+** and
**pnpm 11+**.

```bash
pnpm install
pnpm check
```

`pnpm check` is the full gate: it typechecks the workspace, verifies that
committed manifests match adapter-generated output, runs the connector smoke
tests, scans for accidentally committed secrets, and enforces the public
surface boundary. Run it before opening a pull request.

Common scripts:

```bash
pnpm build            # typecheck + build all packages and clients
pnpm generate         # regenerate committed manifests/configs from adapters
pnpm smoke:dry-run    # validate adapter MCP config + public contract via a stub
pnpm smoke:execute    # additionally run adapter-declared local commands
```

Individual package and client checks are available via pnpm filters, e.g.
`pnpm --filter @membase/client-claude typecheck`.

## Contributing

Contributions are welcome! Adding a new MCP host is often just a descriptor —
`defineMcpHostAgent()` in `packages/connector-sdk` — plus a regen, not a
hand-written adapter. See [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the
branch → `pnpm check` → PR flow, and how to add a connector, and please review
our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please do not open public issues for security problems. See
[SECURITY.md](SECURITY.md) for how to report a vulnerability, and
[docs/security.md](docs/security.md) for the connector secret-handling and
redaction model.

## License

Released under the [MIT License](LICENSE).
