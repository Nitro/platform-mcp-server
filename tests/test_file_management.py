# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for file management tools"""

from pathlib import Path  # noqa: TC003

import pytest
from mcp import ClientSession  # noqa: TC002

from app.tools.file_management import FileListResult


@pytest.mark.anyio
async def test_list_files_empty_workspace(
    client: ClientSession,
) -> None:
    """Empty workspace returns no files."""
    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 0
    assert result.files == []


@pytest.mark.anyio
async def test_list_files_returns_pdfs(
    client: ClientSession,
    pdf_a: str,
) -> None:
    """Only PDF files are returned when file_type is pdf."""
    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    assert result.files[0].name == pdf_a
    assert result.files[0].file_type == "pdf"


@pytest.mark.anyio
async def test_list_files_all_types(
    client: ClientSession,
    pdf_a: str,
    temp_workspace: Path,
) -> None:
    """All file types are returned when file_type is None."""
    (temp_workspace / "b.txt").touch()

    response = await client.call_tool("list_files", {"file_type": None})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 2
    assert result.requested_file_type is None
    assert {f.name for f in result.files} == {pdf_a, "b.txt"}
    assert {f.file_type for f in result.files} == {"pdf", "txt"}


@pytest.mark.anyio
async def test_list_files_sorted_newest_first(
    client: ClientSession,
    pdf_a: str,
    temp_workspace: Path,
) -> None:
    """Files are sorted newest first."""
    (temp_workspace / "b.pdf").write_bytes(b"pdf-b-content")

    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert [f.name for f in result.files] == ["b.pdf", pdf_a]
