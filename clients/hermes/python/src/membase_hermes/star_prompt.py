from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO = "aristoapp/hermes-membase"
GH_CHECK_TIMEOUT_S = 3
STAR_TIMEOUT_S = 30
STATE_PATH = Path.home() / ".membase" / "state" / "star-prompt.json"


def _has_been_prompted() -> bool:
    if not STATE_PATH.exists():
        return False
    try:
        raw = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        return isinstance(raw.get("prompted_at"), str)
    except Exception:
        return False


def _mark_prompted() -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {"prompted_at": datetime.now(UTC).isoformat()}
    STATE_PATH.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")


def _run_gh(args: list[str], timeout_s: int) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env["GH_PROMPT_DISABLED"] = "1"
    return subprocess.run(
        ["gh", *args],
        text=True,
        capture_output=True,
        timeout=timeout_s,
        env=env,
        check=False,
    )


def _is_gh_installed() -> bool:
    try:
        result = _run_gh(["--version"], GH_CHECK_TIMEOUT_S)
        return result.returncode == 0
    except Exception:
        return False


def _is_gh_authenticated() -> bool:
    try:
        result = _run_gh(["auth", "status"], GH_CHECK_TIMEOUT_S)
        return result.returncode == 0
    except Exception:
        return False


def _star_repo() -> tuple[bool, str]:
    try:
        result = _run_gh(["api", "-X", "PUT", f"/user/starred/{REPO}"], STAR_TIMEOUT_S)
    except Exception as error:
        return False, str(error)
    if result.returncode == 0:
        return True, ""
    reason = (result.stderr or result.stdout).strip() or "unknown error"
    return False, reason


def maybe_prompt_github_star() -> None:
    """One-time post-login prompt to star the Hermes plugin repository."""
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        return
    if _has_been_prompted():
        return
    if not _is_gh_installed() or not _is_gh_authenticated():
        return

    try:
        answer = input("[membase] Enjoying Membase? Star it on GitHub? [Y/n] ").strip().lower()
    except Exception:
        return

    try:
        _mark_prompted()
    except Exception as error:
        print(
            f"[membase] Could not persist star prompt state: {error}",
            file=sys.stderr,
        )

    approved = answer in ("", "y", "yes")
    if not approved:
        return
    ok, reason = _star_repo()
    if ok:
        print("[membase] Thanks for the star!")
        return
    print(f"[membase] Could not star repository automatically: {reason}", file=sys.stderr)
