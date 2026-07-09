# Hermes Python Runtime

The Hermes Agent runtime for Membase. It ships the memory
provider, HTTP client with OAuth (browser login and headless
`client_credentials`), auto-capture, built-in-memory mirroring, the CLI, and
the installer.

Layout:

- `pyproject.toml` — package `membase-hermes`, console scripts
  `hermes-membase` (CLI) and `hermes-membase-install` (installer). Version is
  pinned to the repo-wide `0.0.0` until publishing is decided.
- `src/membase_hermes/plugin/plugin.yaml` must stay byte-equal to the
  generator-owned `clients/hermes/plugin/plugin.yaml`.
- `src/membase_hermes/provider.py` and `src/membase_hermes/plugin/__init__.py`
  are the Hermes memory-provider import/register boundary.
- `tests/` — unittest suite copied from the standalone repo; run in CI.

Not enabled here: PyPI upload, marketplace submission, or global install —
publishing is a separate launch-time step.

## Local Checks

```bash
pnpm hermes:python-parity   # metadata, entrypoints, YAML sync, syntax, runtime presence
pnpm hermes:test            # unittest suite (needs httpx + PyYAML on PYTHONPATH)
```
