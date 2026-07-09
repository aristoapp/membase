# Contributing to Membase Plugin/MCP

Thanks for your interest in contributing! This repo is the connector kit that
plugs [Membase](https://membase.so) into AI clients. Whether you're fixing a
bug, improving docs, or adding support for a new MCP host, this guide will get
you started.

By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report bugs** or request features via [GitHub Issues](https://github.com/aristoapp/membase-plugin-mcp/issues).
- **Ask questions or chat** with the community and maintainers on our [Discord](https://discord.gg/vHgtDd6UTK).
- **Improve documentation** — install guides, the architecture docs, or this file.
- **Add or improve a connector** for a new or existing MCP host.
- **Report a security issue** privately — see [SECURITY.md](SECURITY.md).

## Development setup

You'll need **Node.js 20+** and **pnpm 11+** (this is a pnpm monorepo). The
full test matrix additionally uses **Bun** (Claude/OpenClaw/capture-core
runtime tests) and **Python 3.11+** with `httpx` + `pyyaml` (Hermes). In CI
the Claude Code CLI is also installed for live plugin validation; locally
that step skips with a warning when the CLI is absent.

```bash
git clone https://github.com/aristoapp/membase-plugin-mcp.git
cd membase-plugin-mcp
pnpm install
pnpm check   # full guard chain (offline; needs python3 for the Hermes parity check)
pnpm test    # all package test suites (needs Bun + Python)
```

`pnpm check` is the full gate. It must pass before a pull request is merged. It:

- typechecks the workspace,
- verifies committed manifests/configs match adapter-generated output,
- runs the connector smoke tests (fully offline — no Membase account needed),
- scans for accidentally committed secrets, and
- enforces the public surface boundary.

Everything above runs offline against fakes; only the `e2e/` tiers talk to
live Membase environments, and those need credentials you won't have as an
external contributor — CI runs them for you.

Useful scripts while developing:

```bash
pnpm build            # typecheck + build all packages and clients
pnpm generate         # regenerate committed manifests/configs from adapters
pnpm smoke:dry-run    # validate MCP config shape + public contract via a stub
pnpm smoke:execute    # additionally run adapter-declared local commands
pnpm --filter <pkg> typecheck   # check a single package/client
```

## Pull request workflow

1. Fork the repo (or create a branch if you have write access).
2. Create a topic branch: `git checkout -b feat/my-change` or `docs/...`, `fix/...`.
3. Make your change. If you touch a descriptor, adapter, or the connector SDK,
   run `pnpm generate` so committed artifacts stay in sync.
4. Run `pnpm check` and make sure it's green.
5. Open a pull request against `main` with a clear description of the change and
   why it's needed.

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit
and PR titles, scoped by area — for example:

```
feat(cursor): add hooks-based capture
fix(core): redact nested env values in diagnostics
docs(install): clarify Hermes MCP-to-YAML translation
```

## Project conventions

A few principles keep this repo maintainable. Please follow them:

- **The public contract is small and fixed.** Connectors expose only
  `remember`, `search`, `getContext`, and `deleteOrForget`, plus
  manifest/config generation and smoke tests. Internal Membase terms (storage
  schema, graph, embeddings, ranking, governance) must never appear in
  `packages/core` or `packages/connector-sdk` — a CI guard enforces this.
- **Descriptor over adapter.** For a config-only MCP host, add a
  `defineMcpHostAgent()` descriptor plus a regen — not a hand-written adapter.
  Reserve full adapters for clients with genuinely different runtime behavior.
- **Behavioral variance stays per-client.** Don't merge adapters sideways; push
  genuinely shared behavior down into `packages/capture-core` instead.
- **Every enforced decision gets a doc and a guard.** If you change a rule,
  update its doc (usually under `docs/`) *and* the `scripts/check-*.mjs`
  guard that enforces it, in the same PR.
- **Committed manifests/configs are generated artifacts.** Don't hand-edit files
  under `manifests/` or generated files under `clients/*`; change the adapter or
  descriptor and run `pnpm generate`.

See [MAP.md](MAP.md) for a map of where things live, and
[docs/architecture.md](docs/architecture.md) for the reasoning behind these
boundaries.

## Adding a new connector

Most new MCP hosts follow the same shape: "point this host at
`https://mcp.membase.so/mcp` and authorize over OAuth." For those, add a
descriptor with `defineMcpHostAgent()` in `packages/connector-sdk`, regenerate
artifacts with `pnpm generate`, and add an install guide under `docs/install/`.

For a client that needs a native runtime (its own plugin, hooks, or provider),
implement the `ClientAdapter` interface from `@membase/connector-sdk` in a new
`clients/<name>/` package. Open an issue first so we can discuss the shape
before you invest in a full runtime.

## Reporting bugs

Good bug reports include the client and version, your OS, the steps to
reproduce, what you expected, and what actually happened. Redact any secrets or
personal memory content before sharing logs.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE) that covers this project.
