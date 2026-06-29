from __future__ import annotations

from typing import Sequence

from . import PACKAGE_NAME, __version__


def main(argv: Sequence[str] | None = None) -> int:
    args = list(argv or [])
    print(f"{PACKAGE_NAME} {__version__}: local review scaffold")
    if args and args[0] == "status":
        print("Hermes provider boundary: importable review scaffold")
    else:
        print("Runtime provider behavior is pending explicit migration approval.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
