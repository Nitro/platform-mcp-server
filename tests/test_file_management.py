# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for file management tools"""

import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.tools.file_management import FileListResult, ListFilesRequest
from tests.tool_caller import ToolCaller


@pytest.mark.anyio
async def test_list_files_empty(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Empty folder returns no files."""
    files_handler_mock.list_files.return_value = []
    response = await tool_caller.call(
        "list_files", ListFilesRequest(folder=tmp_path, file_type=None)
    )

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 0
    assert result.files == []
    files_handler_mock.list_files.assert_called_once_with(tmp_path, None)


@pytest.mark.anyio
async def test_list_files_returns_pdfs(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Only PDF files are returned when file_type is pdf."""
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"pdf-content")
    files_handler_mock.list_files.return_value = [pdf]
    response = await tool_caller.call(
        "list_files", ListFilesRequest(folder=tmp_path, file_type="pdf")
    )

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    assert Path(result.files[0].path).name == "a.pdf"
    assert result.files[0].file_type == "pdf"
    files_handler_mock.list_files.assert_called_once_with(tmp_path, "pdf")


@pytest.mark.anyio
async def test_list_files_all_types(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """All file types are returned when file_type is None."""
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"pdf-content")
    txt = tmp_path / "b.txt"
    txt.touch()
    files_handler_mock.list_files.return_value = [pdf, txt]
    response = await tool_caller.call(
        "list_files", ListFilesRequest(folder=tmp_path, file_type=None)
    )

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 2
    assert result.requested_file_type is None
    assert {Path(f.path).name for f in result.files} == {"a.pdf", "b.txt"}
    files_handler_mock.list_files.assert_called_once_with(tmp_path, None)


@pytest.mark.anyio
async def test_list_files_sorted_newest_first(
    tool_caller: ToolCaller,
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
    response = await tool_caller.call(
        "list_files", ListFilesRequest(folder=tmp_path, file_type="pdf")
    )

    result = FileListResult.model_validate(response.structuredContent)
    assert [Path(f.path).name for f in result.files] == ["b.pdf", "a.pdf"]
    files_handler_mock.list_files.assert_called_once_with(tmp_path, "pdf")


@pytest.mark.anyio
async def test_list_files_with_folder_name(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """list_files resolves bare folder names from home directory."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    downloads = fake_home / "Downloads"
    downloads.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    pdf = downloads / "document.pdf"
    pdf.write_bytes(b"pdf-content")
    files_handler_mock.list_files.return_value = [pdf]

    response = await tool_caller.call(
        "list_files", ListFilesRequest(folder=Path("Downloads"), file_type="pdf")
    )

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    assert Path(result.files[0].path).name == "document.pdf"
    files_handler_mock.list_files.assert_called_once_with(downloads, "pdf")


@pytest.mark.anyio
async def test_list_files_with_subfolder(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """list_files resolves subfolder paths under home directories."""
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

    response = await tool_caller.call(
        "list_files",
        ListFilesRequest(folder=Path("Desktop/my-project"), file_type="pdf"),
    )

    result = FileListResult.model_validate(response.structuredContent)
    assert result.total_count == 1
    files_handler_mock.list_files.assert_called_once_with(project, "pdf")
