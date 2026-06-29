# Hermes Python Runtime Review Scaffold

This directory preserves the Hermes Agent Python package shape as a local
review artifact for the integrated Plugin/MCP repo.

It is intentionally non-publishing:

- `pyproject.toml` keeps the old `hermes-membase` package name and console
  script names reviewable.
- `src/hermes_membase/plugin/plugin.yaml` must stay in sync with
  `clients/hermes/plugin/plugin.yaml`.
- `src/hermes_membase/provider.py` and `src/hermes_membase/plugin/__init__.py`
  preserve the Hermes memory-provider import/register boundary without calling
  the Membase API.
- The console scripts are dry-run review entrypoints until Hermes provider
  runtime API behavior is explicitly migrated.
- No PyPI upload, marketplace submission, global install, or Hermes install
  mutation is enabled here.

## Local Check

```bash
pnpm hermes:python-parity
```

The parity check validates metadata, entrypoints, native YAML sync, Python
syntax, the provider import/register boundary, and the non-publishing boundary.
