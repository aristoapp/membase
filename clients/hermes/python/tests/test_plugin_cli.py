from __future__ import annotations

import argparse
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from membase_hermes.cli import _cmd_resync
from membase_hermes.plugin.cli import _args_to_argv, membase_command


class ResyncClient:
    def __init__(self) -> None:
        self.closed = False

    def is_authenticated(self) -> bool:
        return True

    def search(self, query: str, limit: int = 20) -> list[dict[str, str]]:
        return [{"uuid": "episode-uuid", "content": query}]

    def close(self) -> None:
        self.closed = True


class PluginCliTests(unittest.TestCase):
    def test_args_to_argv_places_global_config_before_subcommand(self) -> None:
        args = argparse.Namespace(
            config="/tmp/membase.json",
            subcommand="resync",
            memory_file="/tmp/MEMORY.md",
            mirror_index="/tmp/mirror_index.json",
            dry_run=True,
        )

        self.assertEqual(
            _args_to_argv(args),
            [
                "--config",
                "/tmp/membase.json",
                "resync",
                "--memory-file",
                "/tmp/MEMORY.md",
                "--mirror-index",
                "/tmp/mirror_index.json",
                "--dry-run",
            ],
        )

    def test_membase_command_propagates_cli_exit_code(self) -> None:
        args = argparse.Namespace(config="/tmp/membase.json", subcommand="status")

        with patch("membase_hermes.cli.main", return_value=7):
            with self.assertRaises(SystemExit) as raised:
                membase_command(args)

        self.assertEqual(raised.exception.code, 7)

    def test_resync_matches_plain_episode_search_results(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            memory_file = root / "MEMORY.md"
            mirror_index = root / "mirror_index.json"
            memory_file.write_text("- Persist this memory\n", encoding="utf-8")
            args = argparse.Namespace(
                memory_file=str(memory_file),
                mirror_index=str(mirror_index),
                dry_run=False,
            )
            client = ResyncClient()

            with patch("membase_hermes.cli._build_client_from_config", return_value=client):
                rc = _cmd_resync(args, root / "membase.json")

            self.assertEqual(rc, 0)
            self.assertTrue(client.closed)
            self.assertIn("episode-uuid", mirror_index.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
