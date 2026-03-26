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

    def write(  # pylint: disable=too-many-arguments
        self,
        filename: str | Path,
        data: bytes,
        *,
        stem_suffix: str | None = None,
        ext: str | None = None,
        sep: str = "-",
    ) -> Path:
        """Write data to a file in the workspace.

        Args:
            filename: Base filename (e.g. 'merged.pdf' or 'a.pdf')
            data: File contents to write
            stem_suffix: Optional tag appended to stem (e.g. 'converted' -> 'a-converted.docx')
            ext: Optional extension override, strips existing ext from filename
            sep: Separator between stem and suffix (default: '-')

        Examples:
            write('a.pdf', b"")                           -> 'a-<timestamp>.pdf'
            write('a.pdf', b"", stem_suffix='sfx', ext='docx') -> 'a-sfx-<timestamp>.docx'
        """
        path = Path(filename) if isinstance(filename, str) else filename
        stem = path.stem
        if stem_suffix:
            stem = f"{stem}{sep}{stem_suffix}"
        timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")  # noqa: DTZ005
        stem = f"{stem}{sep}{timestamp}"
        extension = ext if ext is not None else path.suffix.lstrip(".")
        resolved = self._resolve(Path(f"{stem}.{extension}"))
        if resolved.exists():
            msg = f"File already exists: {resolved.name}"
            raise FileExistsError(msg)
        resolved.write_bytes(data)
        return resolved

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
