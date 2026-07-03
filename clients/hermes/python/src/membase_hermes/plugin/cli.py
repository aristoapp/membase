"""Hermes CLI integration for the Membase plugin.

Hermes scans the active plugin's ``cli.py`` and expects:

* ``register_cli(subparser)`` — adds argparse arguments for the subcommand
* ``membase_command(args)`` — handler invoked with the parsed args

These are wired to the existing ``membase_hermes.cli.main()`` implementation
so that ``hermes membase <cmd>`` behaves identically to ``hermes-membase <cmd>``.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

# Resolve the bundled package, same path logic as __init__.py
_HERE = Path(__file__).resolve().parent
_BUNDLE = _HERE / "_membase_hermes"
if _BUNDLE.exists() and str(_HERE) not in sys.path:
    sys.path.append(str(_HERE))

try:
    from _membase_hermes.config import DEFAULT_API_URL, DEFAULT_CONFIG_PATH  # bundled
except ImportError:
    from membase_hermes.config import DEFAULT_API_URL, DEFAULT_CONFIG_PATH  # local dev


def register_cli(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to membase.json config file",
    )
    commands = subparser.add_subparsers(dest="subcommand", required=True)

    login = commands.add_parser("login", help="Login with OAuth PKCE")
    login.add_argument("--api-url", default=DEFAULT_API_URL)
    login.add_argument("--port", type=int, default=8765)

    commands.add_parser("status", help="Check Membase API connectivity")
    commands.add_parser("logout", help="Remove stored tokens")

    resync = commands.add_parser("resync", help="Rebuild mirror index from MEMORY.md")
    resync.add_argument("--memory-file", default="")
    resync.add_argument("--mirror-index", default="")
    resync.add_argument("--dry-run", action="store_true")

    subparser.set_defaults(func=membase_command)


def _args_to_argv(args: argparse.Namespace) -> list[str]:
    argv: list[str] = ["--config", str(args.config)]
    sub = getattr(args, "subcommand", None) or "status"
    argv.append(sub)
    if sub == "login":
        argv += ["--api-url", args.api_url, "--port", str(args.port)]
    elif sub == "resync":
        if args.memory_file:
            argv += ["--memory-file", args.memory_file]
        if args.mirror_index:
            argv += ["--mirror-index", args.mirror_index]
        if args.dry_run:
            argv.append("--dry-run")
    return argv


def membase_command(args: argparse.Namespace) -> None:
    try:
        from _membase_hermes.cli import main as membase_cli_main  # bundled
    except ImportError:
        from membase_hermes.cli import main as membase_cli_main  # local dev

    raise SystemExit(membase_cli_main(_args_to_argv(args)))


def register(ctx: Any) -> None:
    """Compat shim — some hosts call plugin.cli.register(ctx) directly."""
    if hasattr(ctx, "register_cli_command"):
        return
