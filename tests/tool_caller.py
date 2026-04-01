"""Test utility for calling MCP tools."""

import dataclasses
from typing import Any

from mcp import ClientSession
from mcp.types import CallToolResult
from pydantic import BaseModel


@dataclasses.dataclass
class ToolCaller:
    """Wraps a ClientSession to simplify MCP tool invocations in tests."""

    _client: ClientSession

    async def call(
        self,
        tool_name: str,
        request: BaseModel | dict[str, Any],
        *,
        expected_result: BaseModel | None = None,
        expect_error: bool = False,
    ) -> CallToolResult:
        """Call a tool and optionally assert the result or that an error occurred."""
        assert not (expected_result is not None and expect_error), (
            "expected_result and expect_error are mutually exclusive"
        )

        args = (
            {"request": request.model_dump(mode="json")}
            if isinstance(request, BaseModel)
            else {"request": request}
        )
        result = await self._client.call_tool(tool_name, args)
        if expected_result is not None:
            assert result.structuredContent == expected_result.model_dump(mode="json")
        elif expect_error:
            assert result.isError
        return result
