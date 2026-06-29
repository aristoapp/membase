from __future__ import annotations

from dataclasses import dataclass
from typing import Any


try:
    from agent.memory_provider import MemoryProvider as HermesMemoryProvider  # type: ignore
except Exception:

    class HermesMemoryProvider:
        """Fallback base class for local review without Hermes Agent installed."""


DEFAULT_API_URL = "https://api.membase.com"
TOOL_MEMBASE_REMEMBER = "membase_remember"
TOOL_MEMBASE_SEARCH = "membase_search"
TOOL_MEMBASE_CONTEXT = "membase_get_context"
TOOL_MEMBASE_FORGET = "membase_forget"

PUBLIC_TOOL_NAMES = (
    TOOL_MEMBASE_REMEMBER,
    TOOL_MEMBASE_SEARCH,
    TOOL_MEMBASE_CONTEXT,
    TOOL_MEMBASE_FORGET,
)


@dataclass
class HermesProviderConfig:
    api_url: str = DEFAULT_API_URL
    api_key_env: str = "MEMBASE_API_KEY"


class MembaseMemoryProvider(HermesMemoryProvider):
    """Review-safe Hermes provider boundary for the public connector contract."""

    def __init__(self) -> None:
        self._config = HermesProviderConfig()
        self._session_id = ""

    @property
    def name(self) -> str:
        return "membase"

    def is_available(self) -> bool:
        return True

    def get_config_schema(self) -> list[dict[str, Any]]:
        return [
            {
                "key": "apiUrl",
                "description": "Membase API URL for connector requests.",
                "required": False,
                "default": DEFAULT_API_URL,
                "secret": False,
            },
            {
                "key": "apiKeyEnv",
                "description": "Environment variable name containing the Membase API key.",
                "required": False,
                "default": "MEMBASE_API_KEY",
                "secret": False,
            },
        ]

    def save_config(self, values: dict[str, Any], hermes_home: str) -> None:
        _ = hermes_home
        api_url = str(values.get("apiUrl") or DEFAULT_API_URL).strip()
        api_key_env = str(values.get("apiKeyEnv") or "MEMBASE_API_KEY").strip()
        self._config = HermesProviderConfig(
            api_url=api_url or DEFAULT_API_URL,
            api_key_env=api_key_env or "MEMBASE_API_KEY",
        )

    def initialize(self, session_id: str, **kwargs: Any) -> None:
        _ = kwargs
        self._session_id = session_id

    def system_prompt_block(self) -> str:
        return (
            "Membase connector tools are available for remember, search, "
            "task context, and forget actions."
        )

    def get_tool_schemas(self) -> list[dict[str, Any]]:
        return [
            {
                "name": TOOL_MEMBASE_REMEMBER,
                "description": "Save durable user-approved context in Membase.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string"},
                        "display_summary": {"type": "string"},
                    },
                    "required": ["content", "display_summary"],
                },
            },
            {
                "name": TOOL_MEMBASE_SEARCH,
                "description": "Search Membase for relevant prior context.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "number"},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": TOOL_MEMBASE_CONTEXT,
                "description": "Request task context from Membase.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task": {"type": "string"},
                        "limit": {"type": "number"},
                    },
                    "required": ["task"],
                },
            },
            {
                "name": TOOL_MEMBASE_FORGET,
                "description": "Forget a user-selected Membase item.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "memory_id": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["memory_id"],
                },
            },
        ]

    def handle_tool_call(self, tool_name: str, args: dict[str, Any], **kwargs: Any) -> str:
        _ = args
        _ = kwargs
        if tool_name not in PUBLIC_TOOL_NAMES:
            return f"Unsupported Membase tool: {tool_name}"

        return (
            f"{tool_name} is wired to the Hermes provider review scaffold. "
            f"Runtime API calls remain disabled; configure {self._config.api_key_env} "
            "when the live Hermes path is explicitly accepted."
        )

    def shutdown(self) -> None:
        return None
