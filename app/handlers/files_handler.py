# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Workspace-aware file handler"""

from dataclasses import dataclass
from pathlib import Path


class PathTraversalError(Exception):
    """Raised when a path escapes the workspace."""

    def __init__(self, path: Path) -> None:
        super().__init__(f"Path '{path}' escapes the workspace and is not allowed")


class WorkspaceNotSetError(Exception):
    """Raised when attempting file operations without a configured workspace."""

    def __init__(self) -> None:
        common_folders = get_common_folders()
        folders_list = "\n  - ".join(str(f) for f in common_folders)
        msg = (
            "Workspace not set. Please specify a folder location.\n\n"
            f"Common folders you can use:\n  - {folders_list}\n\n"
            "You can specify a folder by name (e.g., 'Downloads') or full path."
        )
        super().__init__(msg)


def get_common_folders() -> list[Path]:
    """Get list of common folders in the home directory."""
    home = Path.home()
    return [
        home / "Downloads",
        home / "Documents",
        home / "Desktop",
        home / "Pictures",
    ]


def search_folder_in_home(folder_name: str) -> Path | None:
    """
    Search for a folder by name in the home directory.

    Args:
        folder_name: Name of the folder to search for (e.g., "Downloads")

    Returns:
        Full path to the folder if found, None otherwise

    Example:
        search_folder_in_home("Downloads") -> Path("/Users/john/Downloads")
    """
    home = Path.home()
    candidate = home / folder_name

    if candidate.exists() and candidate.is_dir():
        return candidate

    # Try case-insensitive search in common folders
    for common_folder in get_common_folders():
        if common_folder.name.lower() == folder_name.lower() and common_folder.exists():
            return common_folder

    return None


def extract_workspace_and_filename(input_path: Path | str) -> tuple[Path, Path]:
    """
    Extract workspace directory and filename from input path.

    Args:
        input_path: Path to a file (absolute, relative with directories, or bare filename)

    Returns:
        Tuple of (workspace_directory, filename)

    Raises:
        ValueError: If input is a bare filename without directory information

    Rules:
        - Absolute path: workspace = parent dir, filename = name
        - Relative path with dirs: workspace = resolved parent, filename = name
        - Folder name (e.g., "Downloads"): search in home directory first
        - Bare filename: raise error with helpful message

    Examples:
        - "/home/user/docs/file.pdf" -> (Path("/home/user/docs"), Path("file.pdf"))
        - "Downloads/file.pdf" -> (Path("/Users/john/Downloads"), Path("file.pdf"))
        - "./docs/file.pdf" -> (Path("/current/dir/docs"), Path("file.pdf"))
        - "file.pdf" -> raises ValueError
    """
    path = Path(input_path) if isinstance(input_path, str) else input_path

    # Bare filename without directory information
    if len(path.parts) == 1:
        example_path = Path.home() / "Downloads" / path
        msg = (
            f"Please provide full path including directory. "
            f"Got: {path}. "
            f"Expected example: {example_path}"
        )
        raise ValueError(msg)

    # Check if first part might be a folder name in home directory
    if not path.is_absolute() and len(path.parts) >= 2:
        first_part = str(path.parts[0])
        found_folder = search_folder_in_home(first_part)
        if found_folder:
            # Reconstruct the path using the found folder
            remaining_parts = path.parts[1:]
            full_path = found_folder.joinpath(*remaining_parts)
            return full_path.parent, Path(full_path.name)
        # Not found in common folders, fall back to home directory
        full_path = Path.home() / path
        return full_path.parent, Path(full_path.name)

    # Absolute path or starts with ./
    abs_path = path.resolve()

    return abs_path.parent, Path(abs_path.name)


@dataclass
class FilesHandler:
    """Handles file I/O within a confined workspace folder."""

    _root: Path | None

    def set_workspace(self, path: Path) -> None:
        """
        Set the workspace directory for file operations.

        Args:
            path: Path to the workspace directory

        Raises:
            ValueError: If path does not exist or is not a directory
        """
        abs_path = path.resolve()

        if not abs_path.exists():
            msg = f"Workspace folder does not exist: {path}"
            raise ValueError(msg)

        if not abs_path.is_dir():
            msg = f"Workspace path must be a directory, got: {path}"
            raise ValueError(msg)

        self._root = abs_path

    @property
    def has_workspace(self) -> bool:
        """Check if workspace has been configured."""
        return self._root is not None

    @property
    def workspace(self) -> Path:
        """
        Get the current workspace directory.

        Raises:
            WorkspaceNotSetError: If workspace has not been configured
        """
        if self._root is None:
            raise WorkspaceNotSetError
        return self._root

    def ensure_workspace_from_path(self, input_path: Path | str) -> Path:
        """
        Extract workspace from input path and set it on the handler.

        This is a convenience method for single-file operations. It extracts the workspace
        directory from the input path, updates the workspace if needed,
        and returns just the filename for use with read/write methods.

        Args:
            input_path: Full path to a file, or bare filename if workspace already set

        Returns:
            The filename component only (for use with read/write)

        Raises:
            WorkspaceNotSetError: If input_path is a bare filename and workspace not set

        Example:
            filename = handler.ensure_workspace_from_path("/home/docs/file.pdf")
            content = handler.read(filename)  # reads from /home/docs/file.pdf

            # After workspace is set:
            filename = handler.ensure_workspace_from_path("file.pdf")
            content = handler.read(filename)  # reads from workspace/file.pdf
        """
        path = Path(input_path) if isinstance(input_path, str) else input_path

        # If it's a bare filename and workspace is already set, use it
        if len(path.parts) == 1:
            if self.has_workspace:
                return path
            raise WorkspaceNotSetError

        # Otherwise extract workspace from path
        workspace, filename = extract_workspace_and_filename(input_path)
        if not self.has_workspace or workspace != self.workspace:
            self.set_workspace(workspace)
        return filename

    def _resolve(self, path: Path) -> Path:
        if self._root is None:
            raise WorkspaceNotSetError
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

    def _find_available_path(self, stem: str, extension: str) -> Path:
        """Find the next available filename using incremental suffixes."""
        # Try the base filename first
        candidate = self._resolve(Path(f"{stem}.{extension}"))
        if not candidate.exists():
            return candidate

        # Try incremental suffixes: (1), (2), (3), etc.
        max_attempts = 1000
        for counter in range(1, max_attempts + 1):
            candidate = self._resolve(Path(f"{stem}({counter}).{extension}"))
            if not candidate.exists():
                return candidate

        msg = (
            f"Could not find available filename for '{stem}.{extension}' "
            f"after {max_attempts} attempts"
        )
        raise FileExistsError(msg)

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
            write('a.pdf', b"")                                -> 'a.pdf' or 'a(1).pdf' if exists
            write('a.pdf', b"", stem_suffix='sfx', ext='docx') -> 'a-sfx.docx' or 'a-sfx(1).docx'
        """
        path = Path(filename) if isinstance(filename, str) else filename
        stem = path.stem
        if stem_suffix:
            stem = f"{stem}{sep}{stem_suffix}"
        extension = ext if ext is not None else path.suffix.lstrip(".")
        resolved = self._find_available_path(stem, extension)
        resolved.write_bytes(data)
        return resolved

    def list_files(self, extension: str | None = None) -> list[Path]:
        """List files in the workspace, optionally filtered by extension (without leading dot)."""
        if self._root is None:
            raise WorkspaceNotSetError
        if not self._root.exists():
            msg = f"Workspace folder does not exist: {self._root}"
            raise FileNotFoundError(msg)
        if extension is None:
            return [f for f in self._root.iterdir() if f.is_file()]
        return list(self._root.glob(f"*.{extension}"))

    @property
    def root_path(self) -> Path:
        """Path to the workspace folder."""
        return self.workspace
