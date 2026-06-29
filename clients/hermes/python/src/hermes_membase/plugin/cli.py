from __future__ import annotations

import argparse
from typing import Any

from hermes_membase.cli import main as hermes_membase_main


def register_cli(subparser: argparse.ArgumentParser) -> None:
    commands = subparser.add_subparsers(dest="subcommand", required=True)
    commands.add_parser("status", help="Show Membase connector review status")
    subparser.set_defaults(func=membase_command)


def membase_command(args: argparse.Namespace) -> None:
    subcommand = getattr(args, "subcommand", "status")
    raise SystemExit(hermes_membase_main([subcommand]))


def register(ctx: Any) -> None:
    _ = ctx
