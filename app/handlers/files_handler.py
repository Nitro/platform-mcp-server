# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Workspace-aware file handler"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


class PathTraversalError(Exception):
    """Raised when a path escapes the workspace."""

    def __init__(self, path: Path) -> None:
        super().__init__(f"Path '{path}' escapes the workspace and is not allowed")


@dataclass
class FilesHandler:
    """Handles file I/O within a confined workspace folder."""

    _root: Path

    def _resolve(self, path: Path) -> Path:
        resolved = (self._root / path).resolve()
        if not resolved.is_relative_to(self._root.resolve()):
            raise PathTraversalError(path)
        return resolved

    def read(self, path: Path) -> bytes:
        """Read and return bytes from a file in the workspace."""
        resolved = self._resolve(path)
        if not resolved.exists():
            msg = f"File does not exist: {path}"
            raise FileNotFoundError(msg)
        return resolved.read_bytes()

    def _write(self, path: Path, data: bytes) -> Path:
        resolved = self._resolve(path)
        resolved.write_bytes(data)
        return resolved

    def write_timestamped(  # pylint: disable=too-many-arguments
        self, prefix: str, stem: str, suffix: str, data: bytes, *, sep: str = "-"
    ) -> Path:
        """Write data to a file named '<prefix><sep><stem><sep><timestamp>.<suffix>'.

        Example: write_timestamped("converted", "doc", "pdf", data)
                 -> "converted-doc-2026-01-01T120000.pdf"
        """
        timestamp = datetime.now().astimezone().strftime("%Y-%m-%dT%H%M%S")
        path = Path(f"{prefix}{sep}{stem}{sep}{timestamp}.{suffix}")
        return self._write(path, data)

    def list_files(self, extension: str | None = None) -> list[Path]:
        """List files in the workspace, optionally filtered by extension (without leading dot)."""
        if not self._root.exists():
            msg = f"Workspace folder does not exist: {self._root}"
            raise FileNotFoundError(msg)
        if extension is None:
            return [f for f in self._root.iterdir() if f.is_file()]
        return list(self._root.glob(f"*.{extension}"))

    @property
    def root_path(self) -> Path:
        """Path to the workspace folder."""
        return self._root
