# ADR 0001: Integrated Connector Repo Boundary

Date: 2026-06-28

## Status

Accepted.

## Decision

Use one public integration repo with a strict boundary between:

1. A shared connector core that owns auth, endpoint, install, MCP config, and
   public capability types.
2. Client adapters that own Claude, Cursor, Hermes, and OpenClaw manifest/config
   generation and install docs.
3. Smoke tests that exercise only the public connector contract.

The repo must expose connector capabilities, not Membase internals.

Public contract:

- `remember`
- `search`
- `getContext`
- `deleteOrForget`
- client manifest/config generation
- client smoke tests

Private implementation details that must stay out of public connector APIs:

- memory storage schema
- graph structure
- embedding or chunking implementation
- ranking and freshness algorithm
- internal governance implementation

## Architecture Shape

```text
clients/{claude,cursor,hermes,openclaw}
  -> packages/connector-sdk
  -> packages/core
  -> Membase Context API
  -> private Membase memory engine
```

Each adapter must declare:

- install target paths
- manifest shape
- MCP server config shape
- hook support
- environment variable handling
- smoke-test commands

`packages/core` owns normalized endpoint and auth config primitives. It may
generate client-safe config objects, but it must not import or describe
Membase storage, ranking, graph, embedding, or governance internals.

`packages/connector-sdk` owns the adapter-facing extension surface. New clients
should be addable by defining an adapter boundary instead of forking core
runtime logic.

## OSS Evidence

Checked primary GitHub sources on 2026-06-28:

- `obra/superpowers` keeps multiple client plugin directories such as
  `.claude-plugin`, `.codex-plugin`, and `.cursor-plugin`, with compact
  marketplace/plugin metadata.
- `PostHog/ai-plugin` keeps client plugin metadata, hooks, commands, skills,
  MCP config, and tests in one repo.
- `upstash/context7` publishes Claude marketplace metadata separately from its
  server/runtime code, supporting a public connector boundary.
- `modelcontextprotocol/inspector` includes `.mcp.json` examples that keep MCP
  server configuration explicit and inspectable.
- `modelcontextprotocol/registry` separates API/registry implementation areas
  from data and test surfaces.
- `lastmile-ai/mcp-eval` and `mclenhard/mcp-evals` both keep eval schemas,
  examples, and tests as first-class repo artifacts.

Relevant source links:

- https://github.com/obra/superpowers
- https://github.com/PostHog/ai-plugin
- https://github.com/upstash/context7
- https://github.com/modelcontextprotocol/inspector
- https://github.com/modelcontextprotocol/registry
- https://github.com/lastmile-ai/mcp-eval
- https://github.com/mclenhard/mcp-evals

## Consequences

- Client-specific differences remain in `clients/*` and generated manifests.
- Shared install/auth/MCP behavior remains reusable and testable.
- README and install docs can be public without revealing internal Membase
  memory implementation details.
- Migration from four existing repos becomes a parity checklist instead of four
  independent product lines.

## Verification Strategy

- Keep a public-surface guard that scans adapter/core source and generated
  public artifacts for forbidden internal implementation terms.
- Add smoke tests for generated MCP config, auth env handling, memory write,
  memory search, context retrieval, and forget/delete behavior.
- Use external MCP tooling such as Inspector only against public config and
  public connector capabilities.
