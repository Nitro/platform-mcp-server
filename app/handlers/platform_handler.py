# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""High-level handler for Nitro Platform API operations"""

import json
from dataclasses import dataclass
from typing import Any, ClassVar, Literal, TypedDict, cast

import httpx

from app.client.enums import CompressionLevel, ContentType, FileFormat
from app.client.platform_client import AcceptFormat, BytesFile, PlatformApiClient
from app.utils.utils import check_http_response


class PageRotation(TypedDict):
    """Represents a page rotation operation"""

    pageIndex: int
    amount: int


class PdfMetadata(TypedDict, total=False):
    """PDF metadata fields"""

    title: str
    author: str
    subject: str
    keywords: str
    creator: str
    producer: str
    creation_date: str
    mod_date: str
    trapped: str


class ExtractionParams(TypedDict, total=False):
    """Query parameters for PDF data extraction endpoints"""

    language: str
    pageIndices: list[int]
    readingOrder: bool


type PdfPermission = Literal["print", "modify", "copy", "annotate", "form", "assemble", "print-hq"]
type ExtractionDataType = Literal["forms", "tables", "text", "accessibility"]


class ConversionNotSupportedError(Exception):
    """Exception raised when an unsupported conversion is attempted"""

    def __init__(self, from_format: FileFormat, to_format: FileFormat) -> None:
        message = f"Conversion from {from_format} to {to_format} is not supported"
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class SupportedConversions:
    """Describes the file formats supported for conversion."""

    from_pdf_to: frozenset[FileFormat] = frozenset({
        FileFormat.DOCX,
        FileFormat.XLSX,
        FileFormat.PPTX,
        FileFormat.JPEG,
        FileFormat.PNG,
    })

    to_pdf_from: frozenset[FileFormat] = frozenset({
        FileFormat.DOC,
        FileFormat.DOCX,
        FileFormat.DOCM,
        FileFormat.DOTX,
        FileFormat.DOTM,
        FileFormat.XLS,
        FileFormat.XLSX,
        FileFormat.XLSM,
        FileFormat.XLTX,
        FileFormat.XLTM,
        FileFormat.PPT,
        FileFormat.PPTX,
        FileFormat.GIF,
        FileFormat.JPEG,
        FileFormat.PNG,
        FileFormat.TIFF,
        FileFormat.SVG,
        FileFormat.EPS,
        FileFormat.PSD,
        FileFormat.TXT,
        FileFormat.XML,
        FileFormat.CSV,
        FileFormat.RTF,
        FileFormat.HTML,
    })


def _get_token(http_client: httpx.Client, base_url: str, client_id: str, client_secret: str) -> str:
    """Exchange client credentials for a bearer token."""
    response = http_client.post(
        f"{base_url}/oauth/token",
        json={"clientID": client_id, "clientSecret": client_secret},
    )
    response.raise_for_status()
    return response.json()["accessToken"]


@dataclass
class PlatformHandler:
    """High-level handler for platform document operations"""

    supported_conversions: ClassVar[SupportedConversions] = SupportedConversions()

    _platform_client: PlatformApiClient

    @classmethod
    def from_auth_token(
        cls,
        base_url: str,
        auth_token: str,
        httpx_client: httpx.Client | None = None,
    ) -> PlatformHandler:
        """Create a PlatformHandler authenticated with a bearer token."""
        if httpx_client is None:
            httpx_client = httpx.Client(headers={"Authorization": f"Bearer {auth_token}"})
        else:
            httpx_client.headers["Authorization"] = f"Bearer {auth_token}"
        return cls(PlatformApiClient(httpx_client, base_url))

    @classmethod
    def from_client_credentials(
        cls, base_url: str, client_credentials: tuple[str, str]
    ) -> PlatformHandler:
        """Create a PlatformHandler by exchanging client credentials for a bearer token."""
        httpx_client = httpx.Client()
        auth_token = _get_token(httpx_client, base_url, *client_credentials)
        return cls.from_auth_token(base_url, auth_token, httpx_client=httpx_client)

    def _is_valid_conversion(self, file_type: FileFormat, to: FileFormat) -> bool:
        return (file_type == FileFormat.PDF and to in self.supported_conversions.from_pdf_to) or (
            to == FileFormat.PDF and file_type in self.supported_conversions.to_pdf_from
        )

    def _extract_result(self, content: bytes) -> bytes:
        parsed: dict[str, Any] = json.loads(content)
        return json.dumps(parsed["result"], indent=2).encode()

    def merge_pdfs(self, file_contents: list[bytes]) -> bytes:
        """
        Merge multiple PDFs into a single PDF.

        Args:
            file_contents: List of PDF file contents as bytes

        Returns:
            Merged PDF content as bytes

        Raises:
            ValueError: If file_contents is empty
            RuntimeError: If merge operation fails
        """
        if not file_contents:
            msg = "At least one PDF file is required for merging"
            raise ValueError(msg)

        pdf_files: list[BytesFile] = []
        for i, content in enumerate(file_contents):
            pdf_file = BytesFile(
                content_type=ContentType.PDF, content=content, name=f"document_{i}.pdf"
            )
            pdf_files.append(pdf_file)

        response = self._platform_client.run(
            "transformations",
            pdf_files,
            method="merge",
            params={},
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def convert_file(self, file_bytes: bytes, file_type: FileFormat, to: FileFormat) -> bytes:
        """Convert a file to a different format."""
        if not self._is_valid_conversion(file_type, to):
            raise ConversionNotSupportedError(file_type, to)
        file = BytesFile(
            content_type=ContentType[file_type.value.upper()],
            content=file_bytes,
            name=f"input.{file_type.value}",
        )

        response = self._platform_client.run(
            "conversions",
            file,
            method=None,
            params={"to": to},
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def get_pdf_metadata(self, file_content: bytes) -> bytes:
        """Get PDF metadata properties and return as JSON result."""
        pdf_file = BytesFile(
            content_type=ContentType.PDF, content=file_content, name="document.pdf"
        )

        response = self._platform_client.run(
            "extractions",
            pdf_file,
            method="get-properties",
            params={},
            accept_format=AcceptFormat.JSON,
        )

        check_http_response(response)
        return self._extract_result(response.content)

    def compress_pdf(self, file_bytes: bytes, level: CompressionLevel) -> bytes:
        """
        Compress a PDF file to reduce its size.

        Args:
            file_bytes: PDF file content as bytes
            level: Compression level (light, medium, or heavy)

        Returns:
            Compressed PDF content as bytes

        Raises:
            RuntimeError: If compression operation fails
        """
        level_map = {
            CompressionLevel.LIGHT: 0,
            CompressionLevel.MEDIUM: 1,
            CompressionLevel.HEAVY: 2,
        }
        level_int = level_map[level]

        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        response = self._platform_client.run(
            "transformations",
            file,
            method="compress",
            params={"level": level_int},
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def split_pdf(self, file_bytes: bytes, page_ranges: list[list[int]]) -> bytes:
        """
        Split a PDF by page ranges into separate PDFs packaged in a ZIP file.

        Args:
            file_bytes: PDF file content as bytes
            page_ranges: List of page ranges (0-based indices), e.g. [[0,1,2], [4], [6,7,8]]

        Returns:
            ZIP file content as bytes containing the split PDFs

        Raises:
            ValueError: If page_ranges is empty
            RuntimeError: If split operation fails
        """
        if not page_ranges:
            msg = "At least one page range is required for splitting"
            raise ValueError(msg)

        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        response = self._platform_client.run(
            "transformations",
            file,
            method="split",
            params={"pageIndices": page_ranges},
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def rotate_pdf(self, file_bytes: bytes, rotations: list[PageRotation]) -> bytes:
        """
        Rotate specific pages in a PDF file.

        Args:
            file_bytes: PDF file content as bytes
            rotations: List of rotations with 0-based page indices,
                      e.g. [{"pageIndex": 0, "amount": 90}, {"pageIndex": 2, "amount": 180}]

        Returns:
            Rotated PDF content as bytes

        Raises:
            ValueError: If rotations list is empty
            RuntimeError: If rotation operation fails
        """
        if not rotations:
            msg = "At least one rotation is required"
            raise ValueError(msg)

        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        response = self._platform_client.run(
            "transformations",
            file,
            method="rotate",
            params={"rotations": rotations},
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def protect_pdf(
        self,
        file_bytes: bytes,
        owner_password: str | None = None,
        user_password: str | None = None,
        permissions: list[PdfPermission] | None = None,
    ) -> bytes:
        """
        Protect a PDF with passwords and permissions.

        Args:
            file_bytes: PDF file content as bytes
            owner_password: Owner password for full access (optional)
            user_password: User password for restricted access (optional)
            permissions: List of allowed permissions (optional):
                        ["print", "modify", "copy", "annotate", "form", "assemble", "print-hq"]

        Returns:
            Protected PDF content as bytes

        Raises:
            ValueError: If neither password is provided
            RuntimeError: If protection operation fails
        """
        if not owner_password and not user_password:
            msg = "At least one password (owner_password or user_password) must be provided"
            raise ValueError(msg)

        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        params: dict[str, str | list[str]] = {}
        if owner_password:
            params["ownerPassword"] = owner_password
        if user_password:
            params["userPassword"] = user_password
        if permissions:
            params["permissions"] = cast(list[str], permissions)

        response = self._platform_client.run(
            "transformations",
            file,
            method="protect",
            params=params,
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def unprotect_pdf(
        self,
        file_bytes: bytes,
        owner_password: str | None = None,
        user_password: str | None = None,
    ) -> bytes:
        """
        Remove password protection from a PDF.

        Args:
            file_bytes: PDF file content as bytes
            owner_password: Owner password to remove protection (optional)
            user_password: User password to remove protection (optional)

        Returns:
            Unprotected PDF content as bytes

        Raises:
            ValueError: If neither password is provided
            RuntimeError: If unprotection operation fails
        """
        if not owner_password and not user_password:
            msg = "At least one password (owner_password or user_password) must be provided"
            raise ValueError(msg)

        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        params: dict[str, str] = {}
        if owner_password:
            params["ownerPassword"] = owner_password
        if user_password:
            params["userPassword"] = user_password

        response = self._platform_client.run(
            "transformations",
            file,
            method="unprotect",
            params=params,
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def delete_pdf_pages(self, file_bytes: bytes, page_indices: list[int]) -> bytes:
        """
        Delete specific pages from a PDF file.

        Args:
            file_bytes: PDF file content as bytes
            page_indices: List of 0-based page indices to delete, e.g. [0, 2, 4]

        Returns:
            Modified PDF content as bytes

        Raises:
            ValueError: If page_indices is empty
            RuntimeError: If deletion operation fails
        """
        if not page_indices:
            msg = "At least one page index is required for deletion"
            raise ValueError(msg)

        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        response = self._platform_client.run(
            "transformations",
            file,
            method="delete",
            params={"pageIndices": page_indices},
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def set_pdf_metadata(self, file_bytes: bytes, metadata: PdfMetadata) -> bytes:
        """
        Set metadata properties for a PDF file.

        Args:
            file_bytes: PDF file content as bytes
            metadata: Dictionary of metadata fields to set. Valid keys:
                     title, author, subject, keywords, creator, producer,
                     creation_date, mod_date, trapped

        Returns:
            Modified PDF content as bytes

        Raises:
            ValueError: If metadata dictionary is empty
            RuntimeError: If metadata operation fails
        """
        if not metadata:
            msg = "At least one metadata field must be provided"
            raise ValueError(msg)

        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        response = self._platform_client.run(
            "transformations",
            file,
            method="metadata",
            params=metadata,
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def flatten_pdf(self, file_bytes: bytes) -> bytes:
        """
        Flatten a PDF to make forms and annotations non-editable.

        This operation converts all interactive elements (form fields, annotations, etc.)
        into static content that becomes part of the page and cannot be edited.

        Args:
            file_bytes: PDF file content as bytes

        Returns:
            Flattened PDF content as bytes

        Raises:
            RuntimeError: If flatten operation fails
        """
        file = BytesFile(content_type=ContentType.PDF, content=file_bytes, name="input.pdf")

        response = self._platform_client.run(
            "transformations",
            file,
            method="flatten",
            params={},
            accept_format=AcceptFormat.BYTES,
        )

        check_http_response(response)
        return response.content

    def extract_pdf_data(
        self,
        file_content: bytes,
        data_type: ExtractionDataType,
        params: ExtractionParams,
    ) -> bytes:
        """Extract data from a PDF file and return as JSON bytes."""
        pdf_file = BytesFile(
            content_type=ContentType.PDF, content=file_content, name="document.pdf"
        )

        method_map: dict[ExtractionDataType, str] = {
            "forms": "extract-forms",
            "tables": "extract-tables",
            "text": "extract-text",
            "accessibility": "extract-accessibility",
        }

        response = self._platform_client.run(
            "extractions",
            pdf_file,
            method=method_map[data_type],
            params=params,
            accept_format=AcceptFormat.JSON,
        )

        check_http_response(response)
        return self._extract_result(response.content)
