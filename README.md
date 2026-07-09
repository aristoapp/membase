# Membase Plugin/MCP

**The official connector kit for plugging [Membase](https://membase.so) into your AI clients.**

[![CI](https://github.com/aristoapp/membase-plugin-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/aristoapp/membase-plugin-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2.svg?logo=discord&logoColor=white)](https://discord.gg/vHgtDd6UTK)

Membase is a persistent memory layer for AI agents — a shared store that
survives across sessions, tools, and platforms so your agents remember what
matters. This repository is the **integration surface**: it gives editors,
CLIs, and MCP-capable agents a consistent, secure way to connect to Membase.

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=membase&config=eyJ1cmwiOiJodHRwczovL21jcC5tZW1iYXNlLnNvL21jcCJ9)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=membase&config=%7B%22type%22%3A%20%22http%22%2C%20%22url%22%3A%20%22https%3A%2F%2Fmcp.membase.so%2Fmcp%22%7D)

## Use cases

Most AI tools forget everything the moment a chat ends. Context you've already
explained — your stack, your preferences, decisions you made last week — has to
be re-explained every session, and it never carries across to a different tool.
With Membase, your agents share one persistent memory:

- **Persistent project context** — your agent remembers your stack, conventions,
  and past decisions instead of asking again every session.
- **Cross-tool continuity** — capture something in Claude Code and recall it in
  Cursor or Codex, because they share one memory.
- **Long-running work** — pick up a multi-day task with the relevant history
  pulled back into context automatically.
- **Personal knowledge** — save facts, preferences, and notes once and let any
  connected agent retrieve them on demand.

## Installation

Every client connects to the same hosted MCP server:
`https://mcp.membase.so/mcp`. **No API key needed** — the first time your
client calls Membase, it opens a Membase OAuth login in your browser. Approve
it once and you're connected; no tokens are stored in any config file.
Headless/CI environments use a `client_credentials` service token via
environment variables instead.

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport http membase https://mcp.membase.so/mcp
```

Want auto-capture and cross-session handoff too? Install the Membase
**plugin** (a bundled MCP server plus hooks) instead — see
[clients/claude](clients/claude).

Full guide: [docs/install/claude.md](docs/install/claude.md)

</details>

<details>
<summary><b>Cursor</b></summary>

Click to install:

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=membase&config=eyJ1cmwiOiJodHRwczovL21jcC5tZW1iYXNlLnNvL21jcCJ9)

Or add it by hand to `.cursor/mcp.json` (this project) or `~/.cursor/mcp.json`
(all projects):

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

Full guide: [docs/install/cursor.md](docs/install/cursor.md)

</details>

<details>
<summary><b>Codex CLI</b></summary>

```bash
codex mcp add membase --url https://mcp.membase.so/mcp
codex mcp login membase
```

Or add it to `~/.codex/config.toml` (global) or `.codex/config.toml`
(this project):

```toml
[mcp_servers.membase]
url = "https://mcp.membase.so/mcp"
```

Full guide: [docs/install/codex.md](docs/install/codex.md)

</details>

<details>
<summary><b>VS Code</b></summary>

Click to install:

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=membase&config=%7B%22type%22%3A%20%22http%22%2C%20%22url%22%3A%20%22https%3A%2F%2Fmcp.membase.so%2Fmcp%22%7D)

Or add it to your MCP config (`.vscode/mcp.json`):

```json
{
  "servers": {
    "membase": {
      "type": "http",
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

</details>

<details>
<summary><b>Hermes Agent</b></summary>

Add the server under `mcp_servers` in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  membase:
    url: "https://mcp.membase.so/mcp"
```

Prefer a native integration? Hermes also ships a Python provider package —
see [clients/hermes](clients/hermes).

Full guide: [docs/install/hermes.md](docs/install/hermes.md)

</details>

<details>
<summary><b>OpenClaw</b></summary>

**Remote MCP (simplest).** Add Membase to your OpenClaw MCP config:

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

**Native plugin (richer — auto-capture and recall).** From an OpenClaw checkout:

```bash
openclaw plugins install --link ./clients/openclaw
openclaw plugins enable openclaw-membase
openclaw gateway restart
```

Full guide: [docs/install/openclaw.md](docs/install/openclaw.md)

</details>

<details>
<summary><b>Other MCP hosts</b> (ChatGPT, Gemini CLI, OpenCode, Poke, …)</summary>

Any MCP-capable host can connect with the generic remote config plus the
OAuth prompt on first use:

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

</details>

## Tools

Every connector gives your agent the same small, stable set of tools:

| Capability | What it does |
| --- | --- |
| `remember` | Save a memory or observation to your Membase store |
| `search` | Retrieve the most relevant memories for a query |
| `getContext` | Pull task-relevant context for the current work |
| `deleteOrForget` | Remove or forget a memory |

You won't call these directly — memory works through natural language, and the
agent calls the tools for you:

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

Every connector is a thin adapter over one shared core, talking to the hosted
Membase API:

```text
Client plugin or MCP config      ← per-client adapter (clients/*)
        │
        ▼
Shared connector core            ← packages/core, packages/connector-sdk
        │
        ▼
Membase API                      ← hosted service (memory storage & search)
```

Client-specific behavior stays in `clients/*`; shared behavior lives in
`packages/*`. The Membase service itself (storage, search, ranking) is a
separate hosted system — this repo is just the connectors, so adding or
improving a client never requires touching a backend.

For the full design rationale, see [docs/architecture.md](docs/architecture.md),
the decision records in [docs/adr/](docs/adr/), and the "where does X live"
map in [MAP.md](MAP.md).

## Contributing

Contributions are welcome! This is a [pnpm](https://pnpm.io) monorepo
(**Node.js 20+**, **pnpm 11+**):

```bash
pnpm install
pnpm check
```

`pnpm check` is the full gate: it typechecks the workspace, verifies that
committed manifests match adapter-generated output, runs the connector smoke
tests, scans for accidentally committed secrets, and enforces the public
surface boundary. Run it before opening a pull request.

Adding a new MCP host is often just a descriptor — `defineMcpHostAgent()` in
`packages/connector-sdk` — plus a regen, not a hand-written adapter. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the setup, the branch → `pnpm check` →
PR flow, and how to add a connector, and please review our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please do not open public issues for security problems. See
[SECURITY.md](SECURITY.md) for how to report a vulnerability, and
[docs/security.md](docs/security.md) for the connector secret-handling and
redaction model.

## License

Released under the [MIT License](LICENSE).
