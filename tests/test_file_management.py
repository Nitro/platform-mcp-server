# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for file management tools"""

import os
from pathlib import Path
from unittest.mock import MagicMock, PropertyMock

import pytest
from mcp import ClientSession

from app.tools.file_management import FileListResult


@pytest.mark.anyio
async def test_list_files_empty_workspace(
    client: ClientSession,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Empty workspace returns no files."""
    files_handler_mock.list_files.return_value = []
    type(files_handler_mock).root_path = PropertyMock(return_value=tmp_path)
    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 0
    assert result.files == []
    files_handler_mock.list_files.assert_called_once_with("pdf")


@pytest.mark.anyio
async def test_list_files_returns_pdfs(
    client: ClientSession,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Only PDF files are returned when file_type is pdf."""
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"pdf-content")
    files_handler_mock.list_files.return_value = [pdf]
    type(files_handler_mock).root_path = PropertyMock(return_value=tmp_path)
    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    assert result.files[0].name == "a.pdf"
    assert result.files[0].file_type == "pdf"
    files_handler_mock.list_files.assert_called_once_with("pdf")


@pytest.mark.anyio
async def test_list_files_all_types(
    client: ClientSession,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """All file types are returned when file_type is None."""
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"pdf-content")
    txt = tmp_path / "b.txt"
    txt.touch()
    files_handler_mock.list_files.return_value = [pdf, txt]
    type(files_handler_mock).root_path = PropertyMock(return_value=tmp_path)
    response = await client.call_tool("list_files", {"file_type": None})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 2
    assert result.requested_file_type is None
    assert {f.name for f in result.files} == {"a.pdf", "b.txt"}
    files_handler_mock.list_files.assert_called_once_with(None)


@pytest.mark.anyio
async def test_list_files_sorted_newest_first(
    client: ClientSession,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Files are sorted newest first."""
    older = tmp_path / "a.pdf"
    older.write_bytes(b"pdf-a-content")
    newer = tmp_path / "b.pdf"
    newer.write_bytes(b"pdf-b-content")
    os.utime(older, (0, 0))
    files_handler_mock.list_files.return_value = [older, newer]
    type(files_handler_mock).root_path = PropertyMock(return_value=tmp_path)
    response = await client.call_tool("list_files", {"file_type": "pdf"})

    result = FileListResult.model_validate(response.structuredContent)
    assert [f.name for f in result.files] == ["b.pdf", "a.pdf"]
    files_handler_mock.list_files.assert_called_once_with("pdf")


@pytest.mark.anyio
async def test_list_files_with_folder_parameter(
    client: ClientSession,
    files_handler_mock: MagicMock,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """list_files with folder parameter sets workspace."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    downloads = fake_home / "Downloads"
    downloads.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    pdf = downloads / "document.pdf"
    pdf.write_bytes(b"pdf-content")
    files_handler_mock.list_files.return_value = [pdf]
    type(files_handler_mock).root_path = PropertyMock(return_value=downloads)

    response = await client.call_tool("list_files", {"file_type": "pdf", "folder": "Downloads"})

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    assert result.files[0].name == "document.pdf"
    files_handler_mock.set_workspace.assert_called_once_with(downloads)


@pytest.mark.anyio
async def test_list_files_with_subfolder(
    client: ClientSession,
    files_handler_mock: MagicMock,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """list_files with subfolder path sets workspace correctly."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    desktop = fake_home / "Desktop"
    desktop.mkdir()
    project = desktop / "my-project"
    project.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    pdf = project / "file.pdf"
    pdf.write_bytes(b"pdf-content")
    files_handler_mock.list_files.return_value = [pdf]
    type(files_handler_mock).root_path = PropertyMock(return_value=project)

    response = await client.call_tool(
        "list_files", {"file_type": "pdf", "folder": "Desktop/my-project"}
    )

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    files_handler_mock.set_workspace.assert_called_once_with(project)
