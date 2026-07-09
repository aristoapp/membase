from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_API_URL = "https://api.membase.so"
REDACTED_TOKEN_SENTINEL = "__HERMES_REDACTED__"


def get_hermes_home() -> Path:
    raw = os.environ.get("HERMES_HOME", "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".hermes"


DEFAULT_CONFIG_PATH = get_hermes_home() / "membase.json"
DEFAULT_TOKEN_FILE_PATH = get_hermes_home() / "credentials" / "membase.json"

KNOWN_KEYS = {
    "apiUrl",
    "clientId",
    "tokenFile",
    "accessToken",
    "refreshToken",
    "serviceClientId",
    "serviceClientSecret",
    "autoRecall",
    "autoWikiRecall",
    "autoCapture",
    "maxRecallChars",
    "debug",
    "mirrorBuiltin",
}


@dataclass
class TokenPair:
    access_token: str = ""
    refresh_token: str = ""


@dataclass
class MembaseConfig:
    api_url: str = DEFAULT_API_URL
    client_id: str = ""
    token_file: Path = DEFAULT_TOKEN_FILE_PATH
    access_token: str = ""
    refresh_token: str = ""
    # Admin-provisioned client_credentials service credentials (CI/headless).
    # When set (and no access token is supplied), the client mints a short-lived
    # access token itself — no browser login, no token file. See membase#318.
    service_client_id: str = ""
    service_client_secret: str = ""
    auto_recall: bool = False
    auto_wiki_recall: bool = False
    auto_capture: bool = True
    mirror_builtin: bool = True
    max_recall_chars: int = 4000
    debug: bool = False


def _str(value: Any, fallback: str) -> str:
    return value if isinstance(value, str) else fallback


def _bool(value: Any, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def _int(value: Any, fallback: int) -> int:
    return value if isinstance(value, int) else fallback


def is_redacted_token_value(value: Any) -> bool:
    return isinstance(value, str) and value == REDACTED_TOKEN_SENTINEL


def normalize_token_value(value: Any) -> str:
    if is_redacted_token_value(value):
        return ""
    return _str(value, "")


def resolve_token_file_path(config: Mapping[str, Any] | None = None) -> Path:
    config = config or {}
    configured = _str(config.get("tokenFile"), "").strip()
    if not configured:
        return DEFAULT_TOKEN_FILE_PATH
    return Path(configured).expanduser()


def config_path_for_home(hermes_home: Path) -> Path:
    return hermes_home / "membase.json"


def token_file_path_for_home(hermes_home: Path) -> Path:
    return hermes_home / "credentials" / "membase.json"


def read_token_file(token_file: Path) -> TokenPair:
    try:
        raw = token_file.read_text(encoding="utf-8")
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return TokenPair()
        return TokenPair(
            access_token=normalize_token_value(parsed.get("accessToken")),
            refresh_token=normalize_token_value(parsed.get("refreshToken")),
        )
    except FileNotFoundError:
        return TokenPair()
    except (json.JSONDecodeError, OSError):
        return TokenPair()


def write_token_file(token_file: Path, tokens: TokenPair) -> None:
    token_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        token_file.parent.chmod(0o700)
    except OSError:
        pass

    payload = json.dumps(
        {
            "accessToken": tokens.access_token,
            "refreshToken": tokens.refresh_token,
        },
        indent=2,
    )
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=token_file.parent,
        delete=False,
    ) as tmp:
        tmp.write(f"{payload}\n")
        temp_path = Path(tmp.name)
    temp_path.replace(token_file)
    try:
        token_file.chmod(0o600)
    except OSError:
        pass


def read_json_file(path: Path) -> dict[str, Any]:
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
        return loaded if isinstance(loaded, dict) else {}
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, OSError):
        return {}


def write_json_file(path: Path, payload: Mapping[str, Any]) -> None:
    """Atomic 0600 write — membase.json can carry tokens on legacy setups."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        delete=False,
    ) as tmp:
        tmp.write(f"{json.dumps(payload, indent=2)}\n")
        temp_path = Path(tmp.name)
    temp_path.replace(path)
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def parse_config(raw_config: Mapping[str, Any] | None = None) -> MembaseConfig:
    raw_config = raw_config or {}
    token_file = resolve_token_file_path(raw_config)
    file_tokens = read_token_file(token_file)

    max_recall_chars = max(
        500,
        min(_int(raw_config.get("maxRecallChars"), 4000), 16000),
    )

    # Environment overrides (for CI/headless). Env wins over file/config so a
    # container can point at staging and inject credentials without editing
    # files or opening a browser.
    env_api_url = _env("MEMBASE_API_URL")
    env_access = _env("MEMBASE_ACCESS_TOKEN")
    env_refresh = _env("MEMBASE_REFRESH_TOKEN")

    return MembaseConfig(
        api_url=env_api_url or _str(raw_config.get("apiUrl"), "") or DEFAULT_API_URL,
        client_id=_str(raw_config.get("clientId"), ""),
        token_file=token_file,
        access_token=env_access or file_tokens.access_token or normalize_token_value(raw_config.get("accessToken")),
        refresh_token=env_refresh or file_tokens.refresh_token or normalize_token_value(raw_config.get("refreshToken")),
        service_client_id=_env("MEMBASE_SERVICE_CLIENT_ID") or _str(raw_config.get("serviceClientId"), ""),
        service_client_secret=_env("MEMBASE_SERVICE_CLIENT_SECRET") or _str(raw_config.get("serviceClientSecret"), ""),
        auto_recall=_bool(raw_config.get("autoRecall"), False),
        auto_wiki_recall=_bool(raw_config.get("autoWikiRecall"), False),
        auto_capture=_bool(raw_config.get("autoCapture"), True),
        mirror_builtin=_bool(raw_config.get("mirrorBuiltin"), True),
        max_recall_chars=max_recall_chars,
        debug=_bool(raw_config.get("debug"), False),
    )


def load_membase_config_file(path: Path | None = None) -> MembaseConfig:
    config_path = path or DEFAULT_CONFIG_PATH
    return parse_config(read_json_file(config_path))


def save_membase_config_file(
    updates: Mapping[str, Any],
    path: Path | None = None,
) -> dict[str, Any]:
    config_path = path or DEFAULT_CONFIG_PATH
    current = read_json_file(config_path)
    merged: dict[str, Any] = {**current, **dict(updates)}
    write_json_file(config_path, merged)
    return merged
