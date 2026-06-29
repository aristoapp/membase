from __future__ import annotations

from pathlib import Path
from typing import Sequence


def main(argv: Sequence[str] | None = None) -> int:
    _ = argv
    plugin_path = Path(__file__).parent / "plugin" / "plugin.yaml"
    print("Hermes Membase install review only.")
    print(f"Native plugin metadata: {plugin_path}")
    print("No package publish, global install, or Hermes config mutation was run.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
