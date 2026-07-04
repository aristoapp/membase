"""Install the Membase Hermes plugin into ~/.hermes/plugins/membase/.

The plugin directory is fully self-contained after installation:

  ~/.hermes/plugins/membase/
    __init__.py          ← plugin entry point (register(ctx))
    cli.py               ← hermes membase <cmd> handler
    plugin.yaml          ← Hermes plugin manifest
    _membase_hermes/     ← full membase_hermes package source (bundled)
      __init__.py
      provider.py
      client.py
      config.py
      oauth.py
      cli.py
      mirror.py
      sanitize.py
      installer.py

This means NO pip install into Hermes's venv is required.
Real-user install is just two commands:

    pip install hermes-membase
    hermes-membase-install
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def _get_hermes_home() -> Path:
    raw = os.environ.get("HERMES_HOME", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".hermes"


def install_plugin_payload(target_dir: Path | None = None) -> Path:
    pkg_root = Path(__file__).resolve().parent  # membase_hermes/
    plugin_src = pkg_root / "plugin"  # membase_hermes/plugin/

    if not plugin_src.exists():
        raise FileNotFoundError(f"Plugin payload not found: {plugin_src}")

    destination = target_dir or (_get_hermes_home() / "plugins" / "membase")
    destination.parent.mkdir(parents=True, exist_ok=True)

    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(plugin_src, destination)

    # Bundle the full membase_hermes package source as _membase_hermes/
    # so the plugin is self-contained without needing pip in Hermes's venv.
    bundle_dest = destination / "_membase_hermes"
    bundle_dest.mkdir(exist_ok=True)

    _SKIP = {"plugin", "__pycache__"}
    for item in pkg_root.iterdir():
        if item.name in _SKIP or item.suffix == ".pyc":
            continue
        dest_item = bundle_dest / item.name
        if item.is_dir():
            shutil.copytree(item, dest_item, ignore=shutil.ignore_patterns("__pycache__"))
        else:
            shutil.copy2(item, dest_item)

    return destination


def main() -> int:
    dest = install_plugin_payload()
    bundle = dest / "_membase_hermes"
    print(f"Installed Membase Hermes plugin to: {dest}")
    print(f"  Bundled package source: {bundle}")
    print()
    print("Next steps:")
    print("  hermes memory setup   # accept default apiUrl with Enter")
    print("  hermes membase login  # browser OAuth")
    print("  hermes                # start the agent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
