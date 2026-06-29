from __future__ import annotations

try:
    from hermes_membase.provider import MembaseMemoryProvider
except ImportError:
    from _hermes_membase.provider import MembaseMemoryProvider  # type: ignore


def register(ctx: object) -> None:
    register_memory_provider = getattr(ctx, "register_memory_provider", None)
    if callable(register_memory_provider):
        register_memory_provider(MembaseMemoryProvider())
