# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for file management tools"""

import time
from pathlib import Path  # noqa: TC003

import pytest
from mcp import ClientSession  # noqa: TC002

from app.tools.file_management import FileListResult


@pytest.mark.anyio
async def test_list_files_empty_workspace(
    client: ClientSession,
) -> None:
    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 0
    assert result.files == []


@pytest.mark.anyio
async def test_list_files_returns_pdfs(
    client: ClientSession,
    pdf_a: str,
) -> None:
    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    assert result.files[0].name == pdf_a


@pytest.mark.anyio
async def test_list_files_all_types(
    client: ClientSession,
    pdf_a: str,
    temp_workspace: Path,
) -> None:
    (temp_workspace / "b.txt").touch()

    response = await client.call_tool("list_files", {"file_type": "all"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 2
    assert {f.name for f in result.files} == {pdf_a, "b.txt"}


@pytest.mark.anyio
async def test_list_files_sorted_newest_first(
    client: ClientSession,
    pdf_a: str,
    temp_workspace: Path,
) -> None:
    time.sleep(0.01)
    (temp_workspace / "b.pdf").write_bytes(b"pdf-b-content")

    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert [f.name for f in result.files] == ["b.pdf", pdf_a]
