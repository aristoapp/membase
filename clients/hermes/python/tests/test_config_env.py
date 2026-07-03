from __future__ import annotations

import unittest
from unittest import mock

from membase_hermes import client as client_mod
from membase_hermes.config import parse_config


class ParseConfigEnvTest(unittest.TestCase):
    def _parse(self, env: dict[str, str], raw: dict | None = None):
        # Only the MEMBASE_* keys we care about; clear others so host env
        # (e.g. a real HERMES_HOME token file) can't leak in.
        base = {
            "MEMBASE_API_URL": "",
            "MEMBASE_ACCESS_TOKEN": "",
            "MEMBASE_REFRESH_TOKEN": "",
            "MEMBASE_SERVICE_CLIENT_ID": "",
            "MEMBASE_SERVICE_CLIENT_SECRET": "",
        }
        base.update(env)
        with mock.patch.dict("os.environ", base, clear=False):
            return parse_config(raw or {})

    def test_env_api_url_overrides_config(self) -> None:
        cfg = self._parse({"MEMBASE_API_URL": "https://staging.example"}, {"apiUrl": "https://cfg.example"})
        self.assertEqual(cfg.api_url, "https://staging.example")

    def test_env_access_token_overrides_config(self) -> None:
        cfg = self._parse({"MEMBASE_ACCESS_TOKEN": "env-token"}, {"accessToken": "cfg-token"})
        self.assertEqual(cfg.access_token, "env-token")

    def test_service_credentials_from_env(self) -> None:
        cfg = self._parse(
            {"MEMBASE_SERVICE_CLIENT_ID": "svc_x", "MEMBASE_SERVICE_CLIENT_SECRET": "sekret"}
        )
        self.assertEqual(cfg.service_client_id, "svc_x")
        self.assertEqual(cfg.service_client_secret, "sekret")

    def test_defaults_when_no_env(self) -> None:
        cfg = self._parse({})
        self.assertEqual(cfg.api_url, "https://api.membase.so")
        self.assertEqual(cfg.service_client_id, "")


class ResolveAuthStateTest(unittest.TestCase):
    def _cfg(self, **over):
        return parse_config({}).__class__(**{**parse_config({}).__dict__, **over})

    def test_explicit_access_token_used_as_is(self) -> None:
        cfg = self._cfg(access_token="direct", service_client_id="svc", service_client_secret="s")
        with mock.patch("membase_hermes.oauth.exchange_client_credentials") as ex:
            auth = client_mod.resolve_auth_state(cfg)
        ex.assert_not_called()  # a present token short-circuits before any exchange
        self.assertEqual(auth.access_token, "direct")

    def test_service_credentials_mint_token(self) -> None:
        cfg = self._cfg(access_token="", service_client_id="svc_x", service_client_secret="sekret")
        with mock.patch(
            "membase_hermes.oauth.exchange_client_credentials", return_value="minted-token"
        ) as ex:
            auth = client_mod.resolve_auth_state(cfg)
        ex.assert_called_once()
        self.assertEqual(auth.access_token, "minted-token")
        self.assertEqual(auth.refresh_token, "")  # no refresh for service tokens
        self.assertEqual(auth.client_id, "svc_x")

    def test_no_creds_falls_back_to_empty(self) -> None:
        cfg = self._cfg(access_token="", service_client_id="", service_client_secret="")
        with mock.patch("membase_hermes.oauth.exchange_client_credentials") as ex:
            auth = client_mod.resolve_auth_state(cfg)
        ex.assert_not_called()
        self.assertEqual(auth.access_token, "")


if __name__ == "__main__":
    unittest.main()
