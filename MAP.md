# MAP

Coordinate system for "where does X land" — not API docs. See
[docs/architecture.md](docs/architecture.md) for the decisions that produced
this shape.

## Module inventory

| Path | Owns | One-liner |
| --- | --- | --- |
| `packages/core` | normalized endpoint config primitives | client-safe config only; never imports Membase storage/ranking/graph internals |
| `packages/connector-sdk` | adapter-facing extension surface + `defineMcpHostAgent()` | descriptor mechanism for config-only agents |
| `packages/capture-core` | sanitize, spool/buffer, capture kinds, `MembaseTransport` (OAuth) | shared "what" logic; golden vectors in `spec/*.json` bind TS+Python |
| `clients/claude` | Claude Code plugin (descriptor + `runtime/`) | hybrid: descriptor-tier manifest + real runtime (spawned hook process, disk spool) |
| `clients/cursor` | Cursor MCP host adapter | descriptor-only (`defineMcpHostAgent`) |
| `clients/codex` | Codex CLI MCP host adapter | descriptor-only (`defineMcpHostAgent`) |
| `clients/hermes` | Hermes provider runtime (Python, `membase_hermes`) | host-native Python APIs; kept to a minimal shim (two-language policy) |
| `clients/openclaw` | OpenClaw plugin runtime (TS, in-process) | long-lived gateway, in-memory buffers (not disk spool) |
| `scripts/check-*.mjs` + `check-public-surface.sh` | CI guards, one per invariant | run via `pnpm check`; see Conventions |
| `smoke/` | client-smoke + live-smoke-preflight | exercises public connector contract only |
| `e2e/` | live/staging verification tiers | tier 1 hits prod unauthenticated, tiers 2–3 hit staging with service credentials; see [e2e/README.md](e2e/README.md) |
| `docs/architecture.md` | repo shape + design decisions | source of truth for "why", read before "what" |

## Entry points

- `pnpm check` — the full gate: typecheck, generated-artifacts, all parity/version/secret-hygiene/public-surface guards, smoke dry-run. Run before any PR.
- `pnpm generate` — regenerate descriptor-driven manifests/configs (`scripts/regen-artifacts.mjs`); required after touching a descriptor or `connector-sdk`.
- `pnpm e2e` / `pnpm e2e:live` — staging verification pipeline.

## Conventions

- **Public surface = the hosted MCP tool set + per-client runtime tools** plus client manifest/config generation and smoke tests. Internal terms (storage schema, graph, embedding, ranking, governance) must never leak into `packages/core`/`packages/connector-sdk` — enforced by `check-public-surface.sh`.
- **One guard script per invariant**, named `check-<thing>.mjs`, wired into `pnpm check`. Don't fold guards together; don't skip adding one for a new invariant (see `check-secret-hygiene.mjs`, `check-version-parity.mjs` as the pattern).
- **Descriptor over adapter** for anything that's data-variance, not behavior-variance: a new config-only MCP host agent is a `defineMcpHostAgent()` entry + regen, not a hand-written ~120-line adapter.
- **Behavioral variance stays per-client; never merge adapters sideways** — push shared behavior down into `capture-core` instead.
- **Don't force one abstraction over genuinely different runtime shapes** — Claude's disk spool, OpenClaw's in-memory buffer, and Hermes's thread queue fit three different host lifetimes; only promote to shared code when a new client needs the *same* shape.
- **Golden vectors, not shared runtime, bind TS and Python**: `packages/capture-core/spec/*.json` is the cross-language contract; each language's own test suite consumes the same fixtures.
- **Copy-in first, refactor second** for repo consolidation: bring a working standalone runtime in AS-IS (guards rewritten to assert presence, not absence), defer deduplication to a follow-up. Don't block a working safety net on an unfinished shared-core design.
