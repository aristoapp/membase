from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from importlib import metadata
from pathlib import Path

from . import __version__ as PACKAGE_VERSION

PACKAGE_NAME = "hermes-membase"
REGISTRY_URL = f"https://pypi.org/pypi/{PACKAGE_NAME}/json"
FETCH_TIMEOUT_S = 3
CACHE_TTL = timedelta(days=1)
STATE_PATH = Path.home() / ".membase" / "state" / "hermes-update-check.json"

_STATE_LOCK = threading.Lock()
_BACKGROUND_STARTED = False


@dataclass
class UpdateCheckState:
    checked_at: str
    current_version: str
    latest_version: str | None
    shown_at: str | None


def _current_version() -> str:
    try:
        return metadata.version(PACKAGE_NAME)
    except Exception:
        # Hermes loads bundled plugin source directly, so dist-info metadata
        # may be unavailable at runtime. Fall back to package version constant.
        return PACKAGE_VERSION


def _parse_version(value: str) -> list[int]:
    core = (value.split("-", 1)[0] or value).strip()
    out: list[int] = []
    for part in core.split("."):
        try:
            out.append(int(part))
        except Exception:
            out.append(0)
    return out


def is_newer_version(remote: str, local: str) -> bool:
    r = _parse_version(remote)
    loc = _parse_version(local)
    width = max(len(r), len(loc), 3)
    for i in range(width):
        rv = r[i] if i < len(r) else 0
        lv = loc[i] if i < len(loc) else 0
        if rv > lv:
            return True
        if rv < lv:
            return False
    return False


def _load_state() -> UpdateCheckState | None:
    if not STATE_PATH.exists():
        return None
    try:
        raw = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None
    checked_at = raw.get("checked_at")
    if not isinstance(checked_at, str):
        return None
    current_version = raw.get("current_version")
    latest_version = raw.get("latest_version")
    shown_at = raw.get("shown_at")
    return UpdateCheckState(
        checked_at=checked_at,
        current_version=current_version if isinstance(current_version, str) else _current_version(),
        latest_version=latest_version if isinstance(latest_version, str) else None,
        shown_at=shown_at if isinstance(shown_at, str) else None,
    )


def _save_state(state: UpdateCheckState) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "checked_at": state.checked_at,
        "current_version": state.current_version,
        "latest_version": state.latest_version,
        "shown_at": state.shown_at,
    }
    STATE_PATH.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")


def _fetch_latest_version() -> str | None:
    req = urllib.request.Request(REGISTRY_URL, headers={"accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_S) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError):
        return None
    info = data.get("info") if isinstance(data, dict) else None
    version = info.get("version") if isinstance(info, dict) else None
    return version if isinstance(version, str) else None


def _is_same_utc_day(iso_value: str | None, now: datetime) -> bool:
    if not iso_value:
        return False
    try:
        ts = datetime.fromisoformat(iso_value.replace("Z", "+00:00"))
    except Exception:
        return False
    ts_utc = ts.astimezone(UTC)
    now_utc = now.astimezone(UTC)
    return ts_utc.year == now_utc.year and ts_utc.month == now_utc.month and ts_utc.day == now_utc.day


def _is_fresh_check(checked_at: str, now: datetime) -> bool:
    try:
        ts = datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
    except Exception:
        return False
    return (now - ts.astimezone(UTC)) < CACHE_TTL


def refresh_latest_version() -> None:
    """Fetch latest PyPI version in a non-fatal way and cache state."""
    now = datetime.now(UTC)
    current = _current_version()
    with _STATE_LOCK:
        existing = _load_state()
        if existing and existing.current_version == current and _is_fresh_check(existing.checked_at, now):
            return

    latest = _fetch_latest_version()
    if not latest:
        return

    with _STATE_LOCK:
        existing = _load_state()
        shown_at = existing.shown_at if existing and existing.latest_version == latest else None
        _save_state(
            UpdateCheckState(
                checked_at=now.isoformat(),
                current_version=current,
                latest_version=latest,
                shown_at=shown_at,
            ),
        )


def consume_update_notice() -> str | None:
    """Return notice text at most once per UTC day, else None."""
    now = datetime.now(UTC)
    current = _current_version()
    with _STATE_LOCK:
        state = _load_state()
    if state is None:
        # If no state exists yet, perform a best-effort refresh inline once.
        refresh_latest_version()
        with _STATE_LOCK:
            state = _load_state()
    if not state or not state.latest_version:
        return None
    if state.current_version != current:
        return None
    if not is_newer_version(state.latest_version, current):
        return None
    if _is_same_utc_day(state.shown_at, now):
        return None

    with _STATE_LOCK:
        current_state = _load_state()
        if current_state:
            current_state.shown_at = now.isoformat()
            try:
                _save_state(current_state)
            except Exception:
                pass
    return (
        f"Membase plugin update available: {current} -> {state.latest_version}. "
        "Run: pip install --upgrade hermes-membase"
    )


def start_background_update_check() -> None:
    """Start non-blocking latest-version refresh once per process."""
    global _BACKGROUND_STARTED
    with _STATE_LOCK:
        if _BACKGROUND_STARTED:
            return
        _BACKGROUND_STARTED = True

    def _worker() -> None:
        try:
            refresh_latest_version()
        except Exception:
            # Never fail plugin startup due to update check.
            pass

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
