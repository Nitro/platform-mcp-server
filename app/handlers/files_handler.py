# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File handler for reading and writing files by full path"""

from dataclasses import dataclass
from pathlib import Path


@dataclass
class FilesHandler:
    """Handles file I/O using full file paths."""

    def _find_available_path(self, stem: str, extension: str, directory: Path) -> Path:
        """Find the next available filename using incremental suffixes."""
        candidate = (directory / f"{stem}.{extension}").resolve()
        if not candidate.exists():
            return candidate

        max_attempts = 1000
        for counter in range(1, max_attempts + 1):
            candidate = (directory / f"{stem}({counter}).{extension}").resolve()
            if not candidate.exists():
                return candidate

        msg = (
            f"Could not find available filename for '{stem}.{extension}' "
            f"after {max_attempts} attempts"
        )
        raise FileExistsError(msg)

    def read(self, path: Path) -> bytes:
        """Read and return bytes from a file at the given full path."""
        resolved = path.expanduser().resolve()
        if not resolved.exists():
            msg = f"File does not exist: {resolved}"
            raise FileNotFoundError(msg)
        return resolved.read_bytes()

    def write(
        self,
        path: Path,
        data: bytes,
        *,
        stem_suffix: str | None = None,
        ext: str | None = None,
    ) -> Path:
        """Write data to a file next to the given path.

        The output is written to the same directory as the input path.

        Args:
            path: Full path to the input file (used to determine output directory and stem)
            data: File contents to write
            stem_suffix: Optional tag appended to stem (e.g. 'converted' -> 'a-converted.docx')
            ext: Optional extension override

        Examples:
            write(Path('/docs/a.pdf'), b"")                                -> '/docs/a.pdf'
            write(Path('/docs/a.pdf'), b"", stem_suffix='sfx', ext='docx') -> '/docs/a-sfx.docx'
        """
        resolved = path.expanduser().resolve()
        directory = resolved.parent

        stem = path.stem
        if stem_suffix:
            stem = f"{stem}-{stem_suffix}"
        extension = ext if ext is not None else path.suffix.lstrip(".")
        output_path = self._find_available_path(stem, extension, directory)
        output_path.write_bytes(data)
        return output_path

    def list_files(self, folder: Path, extension: str | None = None) -> list[Path]:
        """List files in the given folder, optionally filtered by extension (no leading dot)."""
        resolved = folder.expanduser().resolve()
        if not resolved.exists():
            msg = f"Folder does not exist: {resolved}"
            raise FileNotFoundError(msg)
        if extension is None:
            return [f for f in resolved.iterdir() if f.is_file()]
        return list(resolved.glob(f"*.{extension}"))
