from __future__ import annotations

from datetime import UTC, datetime


def build_current_date_text(now: datetime | None = None) -> str:
    current = now or datetime.now().astimezone()
    if current.tzinfo is None:
        current = current.astimezone()
    local = current.astimezone()
    utc = local.astimezone(UTC)
    local_iso = local.isoformat(timespec="seconds")
    utc_iso = utc.isoformat(timespec="seconds").replace("+00:00", "Z")
    return "\n".join(
        [
            "Current date/time:",
            f"- local_time: {local_iso}",
            f"- local_date: {local.date().isoformat()}",
            f"- utc_time: {utc_iso}",
            f"- utc_date: {utc.date().isoformat()}",
        ],
    )
