"""Hermes plugin entry point for the Membase memory provider.

Hermes plugin loader calls ``register(ctx)`` and expects
``ctx.register_memory_provider(provider)``.

The plugin directory is self-contained: ``hermes-membase-install`` copies
the full ``membase_hermes`` package source alongside this file so that no
external pip install into Hermes's venv is required.

Layout after install:
  ~/.hermes/plugins/membase/
    __init__.py          ← this file
    cli.py
    plugin.yaml
    _membase_hermes/     ← full package source, bundled by installer
      __init__.py
      provider.py
      client.py
      ...
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the bundled package source is importable when Hermes loads this plugin.
_HERE = Path(__file__).resolve().parent
_BUNDLE = _HERE / "_membase_hermes"

if _BUNDLE.exists() and str(_HERE) not in sys.path:
    sys.path.append(str(_HERE))

# Now import — works both from the installed bundle and during local dev
# (where membase_hermes is importable directly from the src layout).
try:
    from _membase_hermes.provider import MembaseMemoryProvider  # bundled
except ImportError:
    from membase_hermes.provider import (
        MembaseMemoryProvider,  # local dev / editable install
    )


def register(ctx) -> None:
    if hasattr(ctx, "register_memory_provider"):
        ctx.register_memory_provider(MembaseMemoryProvider())
