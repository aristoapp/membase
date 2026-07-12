# Membase Plugin for OpenClaw

Persistent long-term memory for [OpenClaw](https://openclaw.ai/) using hybrid vector search and a knowledge graph. Remembers not just text, but entities, relationships, and facts — across sessions.

> **Free to start** — Sign up at [app.membase.so](https://app.membase.so) and connect in under a minute.

## Install

```bash
openclaw plugins install @membase/openclaw-membase
```

Restart OpenClaw after installing.

## Setup

```bash
openclaw membase login
```

Opens a browser for OAuth authentication. Tokens are saved automatically — no API keys to copy and paste.

## What you get

- **Tools** — `membase_search`, `membase_store`, `membase_profile`, `membase_forget`, `membase_handoff`, wiki search/add/update/delete, and `membase_get_current_date`.
- **Auto-recall** (opt-in) — relevant memories and wiki documents injected before every AI turn.
- **Auto-capture** (opt-in) — conversation transcripts stored to your Wiki, chunked for long sessions, with a disk spool so nothing is lost when the network is down (`openclaw membase dream` drains it).
- **Project-based wiki filing** — file documents into wiki Projects with `project`/`--project`, with known-Project hints surfaced to the agent.

## Links

[Website](https://membase.so) · [Docs](https://docs.membase.so) · [Dashboard](https://app.membase.so) · [Source & Issues](https://github.com/aristoapp/membase-plugin-mcp)

## License

MIT
