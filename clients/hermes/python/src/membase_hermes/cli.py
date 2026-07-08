from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .config import (
    DEFAULT_API_URL,
    DEFAULT_CONFIG_PATH,
    DEFAULT_TOKEN_FILE_PATH,
    TokenPair,
    load_membase_config_file,
    read_json_file,
    save_membase_config_file,
    write_token_file,
)
from .mirror import atomic_write_text
from .star_prompt import maybe_prompt_github_star

if TYPE_CHECKING:
    from .client import MembaseClient


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="hermes-membase")
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to membase.json config file",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    install = sub.add_parser(
        "install",
        help="One-shot install: copy plugin, patch Hermes config, and login",
    )
    install.add_argument("--api-url", default=DEFAULT_API_URL)
    install.add_argument("--port", type=int, default=8765)
    install.add_argument(
        "--skip-login",
        action="store_true",
        help="Skip the OAuth browser login step (run `hermes-membase login` later)",
    )

    login = sub.add_parser("login", help="Login with OAuth PKCE")
    login.add_argument("--api-url", default=DEFAULT_API_URL)
    login.add_argument("--port", type=int, default=8765)

    sub.add_parser("status", help="Check Membase API connectivity")
    sub.add_parser(
        "dream", help="Upload captures that failed to sync and are waiting on disk"
    )
    sub.add_parser("logout", help="Remove stored tokens")
    resync = sub.add_parser("resync", help="Rebuild mirror index from MEMORY.md")
    resync.add_argument(
        "--memory-file",
        default="",
        help="Optional MEMORY.md path (defaults to $HERMES_HOME/MEMORY.md)",
    )
    resync.add_argument(
        "--mirror-index",
        default="",
        help="Optional mirror index output path",
    )
    resync.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without writing mirror index",
    )

    return parser.parse_args(argv)


def _read_existing_config(path: Path) -> dict[str, Any]:
    loaded = read_json_file(path)
    return loaded if isinstance(loaded, dict) else {}


def _build_client_from_config(config_path: Path) -> MembaseClient:
    from .client import MembaseClient, resolve_auth_state

    config = load_membase_config_file(config_path)
    return MembaseClient(
        api_url=config.api_url,
        auth=resolve_auth_state(config),
        debug=config.debug,
        on_token_refresh=lambda access, refresh: write_token_file(
            config.token_file,
            TokenPair(access_token=access, refresh_token=refresh),
        ),
    )


def _cmd_login(args: argparse.Namespace, config_path: Path) -> int:
    from .oauth import (
        OAuthCallbackListener,
        build_authorize_url,
        create_pkce_pair,
        create_state,
        dynamic_register_client,
        exchange_code_for_token,
        open_auth_url,
    )

    api_url = str(args.api_url).rstrip("/")
    preferred_port = int(args.port)
    verifier, challenge = create_pkce_pair()
    state = create_state()

    listener = OAuthCallbackListener(preferred_port, state)
    redirect_uri = f"http://127.0.0.1:{listener.port}/oauth/callback"
    try:
        client_id = dynamic_register_client(api_url, redirect_uri)
        auth_url = build_authorize_url(
            api_url,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            code_challenge=challenge,
        )
        opened = open_auth_url(auth_url)
        if not opened:
            print("Open this URL manually:", file=sys.stderr)
            print(auth_url, file=sys.stderr)
        print("Waiting for browser authorization...", file=sys.stderr)
        if listener.port != preferred_port:
            print(
                f"Port {preferred_port} is in use. Using port {listener.port}.",
                file=sys.stderr,
            )

        code = listener.wait_for_code(timeout_s=180.0)
        tokens = exchange_code_for_token(
            api_url,
            code=code,
            client_id=client_id,
            redirect_uri=redirect_uri,
            code_verifier=verifier,
        )
    finally:
        listener.close()

    existing = _read_existing_config(config_path)
    configured_token_file = existing.get("tokenFile")
    token_file = (
        Path(configured_token_file).expanduser()
        if isinstance(configured_token_file, str) and configured_token_file.strip()
        else DEFAULT_TOKEN_FILE_PATH
    )
    write_token_file(
        token_file,
        TokenPair(
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
        ),
    )
    save_membase_config_file(
        {
            "apiUrl": api_url,
            "clientId": client_id,
            "tokenFile": str(token_file),
        },
        config_path,
    )
    print("OAuth login complete. Credentials saved.")
    try:
        maybe_prompt_github_star()
    except Exception:
        # Best-effort UX only; never fail login flow.
        pass
    return 0


def _cmd_status(config_path: Path) -> int:
    from .client import MembaseApiError

    client = _build_client_from_config(config_path)
    try:
        if not client.is_authenticated():
            print("Not logged in. Run: hermes-membase login", file=sys.stderr)
            return 1
        profile = client.get_profile()
        print("Membase connection: OK")
        if profile:
            print(json.dumps(profile, indent=2))
        return 0
    except MembaseApiError as error:
        print(f"Membase connection failed: {error}", file=sys.stderr)
        return 1
    finally:
        client.close()


def _cmd_dream(config_path: Path) -> int:
    """Upload captures that failed to sync and are waiting on disk (ADR 0005)."""
    from .spool import default_capture_spool

    spool = default_capture_spool()
    pending = spool.pending_count()
    if pending == 0:
        print("Nothing to dream — the capture spool is empty.")
        return 0

    client = _build_client_from_config(config_path)
    try:
        if not client.is_authenticated():
            print("Not logged in. Run: hermes-membase login", file=sys.stderr)
            return 1

        def _send(record: dict[str, Any]) -> None:
            # ingest raises on failure; a normal return counts as success.
            client.ingest(
                record["content"],
                display_summary=record.get("display_summary"),
                project=record.get("project"),
            )

        flushed, remaining = spool.flush(_send)
        tail = (
            f", {remaining} still pending (retry later)."
            if remaining > 0
            else "."
        )
        print(f"Dream complete: uploaded {flushed} capture(s){tail}")
        return 0
    finally:
        client.close()


def _cmd_logout(config_path: Path) -> int:
    existing = _read_existing_config(config_path)
    configured_token_file = existing.get("tokenFile")
    token_file = (
        Path(configured_token_file).expanduser()
        if isinstance(configured_token_file, str) and configured_token_file.strip()
        else DEFAULT_TOKEN_FILE_PATH
    )
    write_token_file(token_file, TokenPair(access_token="", refresh_token=""))
    save_membase_config_file(
        {
            "tokenFile": str(token_file),
            "clientId": "",
        },
        config_path,
    )
    print("Membase tokens removed.")
    return 0


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _extract_memory_entries(memory_file: Path) -> list[str]:
    if not memory_file.exists():
        return []
    lines = memory_file.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    for line in lines:
        text = line.strip()
        if not text:
            continue
        if text.startswith("#"):
            continue
        if text.startswith("- "):
            text = text[2:].strip()
        if len(text) < 8:
            continue
        out.append(text)
    return out


def _cmd_resync(args: argparse.Namespace, config_path: Path) -> int:
    from .client import MembaseApiError

    hermes_home = config_path.parent
    memory_file = Path(args.memory_file).expanduser() if str(args.memory_file).strip() else hermes_home / "MEMORY.md"
    mirror_index_path = (
        Path(args.mirror_index).expanduser()
        if str(args.mirror_index).strip()
        else hermes_home / "plugins" / "membase" / "mirror_index.json"
    )

    entries = _extract_memory_entries(memory_file)
    index: dict[str, str] = {}

    client = _build_client_from_config(config_path)
    try:
        if client.is_authenticated():
            for entry in entries:
                digest = _content_hash(entry)
                try:
                    matches = client.search(entry, limit=3)
                except MembaseApiError:
                    matches = []
                uuid = "resynced"
                for match in matches:
                    episode = match.get("episode") if isinstance(match, dict) else None
                    if not isinstance(episode, dict) and isinstance(match, dict):
                        episode = match
                    if not isinstance(episode, dict):
                        continue
                    content = str(episode.get("content", "") or "").strip()
                    if content == entry:
                        maybe_uuid = str(episode.get("uuid", "") or "").strip()
                        if maybe_uuid:
                            uuid = maybe_uuid
                            break
                index[digest] = uuid
        else:
            index = {_content_hash(entry): "resynced" for entry in entries}
    finally:
        client.close()

    if args.dry_run:
        print(
            json.dumps(
                {
                    "memory_file": str(memory_file),
                    "mirror_index": str(mirror_index_path),
                    "entries": len(entries),
                    "preview": list(index.items())[:10],
                },
                indent=2,
            ),
        )
        return 0

    atomic_write_text(mirror_index_path, f"{json.dumps(index, indent=2)}\n")
    print(
        f"Mirror index rebuilt: {mirror_index_path} (entries={len(index)}, source={memory_file})",
    )
    return 0


def _patch_hermes_config(hermes_home: Path) -> Path:
    """Set ``memory.provider: membase`` in ``~/.hermes/config.yaml``.

    Preserves any existing keys via PyYAML round-trip.
    """
    import yaml

    hermes_home.mkdir(parents=True, exist_ok=True)
    config_yaml = hermes_home / "config.yaml"

    data: dict[str, Any] = {}
    if config_yaml.exists():
        try:
            loaded = yaml.safe_load(config_yaml.read_text(encoding="utf-8")) or {}
            if isinstance(loaded, dict):
                data = loaded
        except yaml.YAMLError:
            backup = config_yaml.with_suffix(".yaml.bak")
            config_yaml.rename(backup)
            print(
                f"Warning: existing config.yaml was unparseable; backed up to {backup}",
                file=sys.stderr,
            )

    memory = data.get("memory")
    if not isinstance(memory, dict):
        memory = {}
    memory["provider"] = "membase"
    data["memory"] = memory

    config_yaml.write_text(
        yaml.safe_dump(data, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    return config_yaml


def _cmd_install(args: argparse.Namespace, config_path: Path) -> int:
    from .installer import _get_hermes_home, install_plugin_payload

    hermes_home = _get_hermes_home()

    plugin_dir = install_plugin_payload()
    print(f"[1/4] Plugin installed: {plugin_dir}")

    config_yaml = _patch_hermes_config(hermes_home)
    print(f"[2/4] Hermes config updated: {config_yaml} (memory.provider = membase)")

    existing = _read_existing_config(config_path)
    api_url = str(args.api_url).rstrip("/")
    save_membase_config_file(
        {
            "apiUrl": existing.get("apiUrl") or api_url,
            "autoRecall": existing.get("autoRecall", False),
            "autoCapture": existing.get("autoCapture", True),
            "mirrorBuiltin": existing.get("mirrorBuiltin", True),
        },
        config_path,
    )
    mirror_index = hermes_home / "plugins" / "membase" / "mirror_index.json"
    mirror_index.parent.mkdir(parents=True, exist_ok=True)
    if not mirror_index.exists():
        mirror_index.write_text("{}\n", encoding="utf-8")
    print(f"[3/4] Membase config initialized: {config_path}")

    if args.skip_login:
        print("[4/4] Skipped OAuth login. Run later: hermes-membase login")
        print()
        print("Next: run `hermes` to start the agent.")
        return 0

    print("[4/4] Starting OAuth login — a browser window will open...")
    print()
    login_rc = _cmd_login(args, config_path)
    if login_rc != 0:
        return login_rc
    print()
    print("Install complete. Run `hermes` to start the agent.")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    config_path = Path(args.config).expanduser()

    if args.command == "install":
        return _cmd_install(args, config_path)
    if args.command == "login":
        return _cmd_login(args, config_path)
    if args.command == "status":
        return _cmd_status(config_path)
    if args.command == "dream":
        return _cmd_dream(config_path)
    if args.command == "logout":
        return _cmd_logout(config_path)
    if args.command == "resync":
        return _cmd_resync(args, config_path)

    print(f"Unknown command: {args.command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
