"""End-to-end test of the `hermes-membase install` CLI path.

Regression cover for the v0.1.6 crash where cli._cmd_install imported
_get_hermes_home after installer.py had been refactored to config.get_hermes_home
— --help passed while the actual install died on ImportError before writing
anything. This drives the real command into a temp HERMES_HOME.
"""

import argparse
import os
import tempfile
import unittest
from pathlib import Path

from membase_hermes import cli


class InstallCommandTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.home = Path(self._tmp.name)
        self._prev_hermes_home = os.environ.get("HERMES_HOME")
        os.environ["HERMES_HOME"] = str(self.home)

    def tearDown(self) -> None:
        if self._prev_hermes_home is None:
            os.environ.pop("HERMES_HOME", None)
        else:
            os.environ["HERMES_HOME"] = self._prev_hermes_home
        self._tmp.cleanup()

    def test_install_skip_login_writes_plugin_config_and_membase_json(self) -> None:
        config_path = self.home / "membase.json"
        args = argparse.Namespace(
            api_url="https://api.membase.so",
            skip_login=True,
        )

        rc = cli._cmd_install(args, config_path)

        self.assertEqual(rc, 0)
        plugin_dir = self.home / "plugins" / "membase"
        self.assertTrue((plugin_dir / "plugin.yaml").is_file())
        self.assertTrue((plugin_dir / "_membase_hermes" / "provider.py").is_file())
        # Installed payload must not ship stale bytecode.
        self.assertEqual(list(plugin_dir.rglob("__pycache__")), [])

        config_yaml = (self.home / "config.yaml").read_text(encoding="utf-8")
        self.assertIn("membase", config_yaml)
        self.assertTrue(config_path.is_file())
        self.assertTrue((plugin_dir / "mirror_index.json").is_file())


if __name__ == "__main__":
    unittest.main()
