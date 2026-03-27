"""Tests for PlatformHandler"""

from unittest.mock import MagicMock

import httpx
import pytest
from pytest_mock import MockerFixture

from app.client import CompressionLevel, FileFormat
from app.client.enums import ContentType
from app.client.platform_client import AcceptFormat, BytesFile, PlatformApiClient
from app.handlers import ConversionNotSupportedError, PlatformHandler
from app.handlers.platform_handler import PageRotation, PdfMetadata


@pytest.fixture(name="platform_client_mock")
def _platform_client_mock(mocker: MockerFixture) -> MagicMock:
    return mocker.create_autospec(PlatformApiClient, instance=True, spec_set=True)


@pytest.fixture(name="platform_handler")
def _platform_handler(platform_client_mock: MagicMock) -> PlatformHandler:
    return PlatformHandler(platform_client_mock)


def test_from_auth_token(mocker: MockerFixture) -> None:
    """from_auth_token creates handler with Bearer token header."""
    httpx_client_mock = mocker.create_autospec(httpx.Client, instance=True, spec_set=True)
    httpx_client_class_mock = mocker.patch("httpx.Client", return_value=httpx_client_mock)
    handler = PlatformHandler.from_auth_token("https://api.example.com", "my-token")
    assert isinstance(handler, PlatformHandler)
    httpx_client_class_mock.assert_called_once_with(headers={"Authorization": "Bearer my-token"})


def test_from_client_credentials(mocker: MockerFixture) -> None:
    """from_client_credentials exchanges credentials for a token then creates handler."""
    get_token_mock = mocker.patch(
        "app.handlers.platform_handler._get_token", return_value="exchanged-token"
    )
    httpx_client_mock = mocker.create_autospec(httpx.Client, instance=True, spec_set=True)
    mocker.patch("httpx.Client", return_value=httpx_client_mock)

    handler = PlatformHandler.from_client_credentials(
        "https://api.example.com", ("client-id", "client-secret")
    )

    assert isinstance(handler, PlatformHandler)
    get_token_mock.assert_called_once_with(
        httpx_client_mock, "https://api.example.com", "client-id", "client-secret"
    )


def test_merge_pdfs(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """merge_pdfs calls client with correct files and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"merged"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.merge_pdfs([b"pdf-1", b"pdf-2"])

    assert result == b"merged"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        [
            BytesFile(content_type=ContentType.PDF, content=b"pdf-1", name="document_0.pdf"),
            BytesFile(content_type=ContentType.PDF, content=b"pdf-2", name="document_1.pdf"),
        ],
        method="merge",
        params={},
        accept_format=AcceptFormat.BYTES,
    )


def test_merge_pdfs_empty_list_raises(platform_handler: PlatformHandler) -> None:
    """merge_pdfs raises ValueError when given an empty list."""
    with pytest.raises(ValueError, match="At least one PDF file is required"):
        platform_handler.merge_pdfs([])


def test_convert_file(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """convert_file calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"converted"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.convert_file(b"pdf-content", FileFormat.PDF, FileFormat.DOCX)

    assert result == b"converted"
    platform_client_mock.run.assert_called_once_with(
        "conversions",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method=None,
        params={"to": FileFormat.DOCX},
        accept_format=AcceptFormat.BYTES,
    )


def test_convert_file_unsupported_raises(platform_handler: PlatformHandler) -> None:
    """convert_file raises ConversionNotSupportedError for unsupported conversions."""
    with pytest.raises(ConversionNotSupportedError):
        platform_handler.convert_file(b"pdf-content", FileFormat.PDF, FileFormat.PDF)


def test_compress_pdf(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """compress_pdf calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"compressed"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.compress_pdf(b"pdf-content", CompressionLevel.MEDIUM)

    assert result == b"compressed"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="compress",
        params={"level": 1},
        accept_format=AcceptFormat.BYTES,
    )


def test_split_pdf(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """split_pdf calls client with correct args and returns ZIP bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"zip-content"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.split_pdf(b"pdf-content", [[0, 1, 2], [4]])

    assert result == b"zip-content"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="split",
        params={"pageIndices": [[0, 1, 2], [4]]},
        accept_format=AcceptFormat.BYTES,
    )


def test_split_pdf_empty_ranges_raises(platform_handler: PlatformHandler) -> None:
    """split_pdf raises ValueError when given empty page ranges."""
    with pytest.raises(ValueError, match="At least one page range is required"):
        platform_handler.split_pdf(b"pdf-content", [])


def test_rotate_pdf(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """rotate_pdf calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"rotated"
    platform_client_mock.run.return_value = mock_response

    rotations: list[PageRotation] = [
        {"pageIndex": 0, "amount": 90},
        {"pageIndex": 2, "amount": 180},
    ]
    result = platform_handler.rotate_pdf(b"pdf-content", rotations)

    assert result == b"rotated"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="rotate",
        params={"rotations": rotations},
        accept_format=AcceptFormat.BYTES,
    )


def test_rotate_pdf_empty_rotations_raises(platform_handler: PlatformHandler) -> None:
    """rotate_pdf raises ValueError when given empty rotations."""
    with pytest.raises(ValueError, match="At least one rotation is required"):
        platform_handler.rotate_pdf(b"pdf-content", [])


def test_protect_pdf(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """protect_pdf calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"protected"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.protect_pdf(
        b"pdf-content",
        owner_password="owner123",
        user_password="user123",
        permissions=["print", "copy"],
    )

    assert result == b"protected"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="protect",
        params={
            "ownerPassword": "owner123",
            "userPassword": "user123",
            "permissions": ["print", "copy"],
        },
        accept_format=AcceptFormat.BYTES,
    )


def test_protect_pdf_no_passwords_raises(platform_handler: PlatformHandler) -> None:
    """protect_pdf raises ValueError when no passwords provided."""
    with pytest.raises(ValueError, match="At least one password"):
        platform_handler.protect_pdf(b"pdf-content")


def test_unprotect_pdf(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """unprotect_pdf calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"unprotected"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.unprotect_pdf(b"pdf-content", owner_password="owner123")

    assert result == b"unprotected"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="unprotect",
        params={"ownerPassword": "owner123"},
        accept_format=AcceptFormat.BYTES,
    )


def test_unprotect_pdf_no_passwords_raises(platform_handler: PlatformHandler) -> None:
    """unprotect_pdf raises ValueError when no passwords provided."""
    with pytest.raises(ValueError, match="At least one password"):
        platform_handler.unprotect_pdf(b"pdf-content")


def test_delete_pdf_pages(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """delete_pdf_pages calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"modified"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.delete_pdf_pages(b"pdf-content", [0, 2, 4])

    assert result == b"modified"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="delete",
        params={"pageIndices": [0, 2, 4]},
        accept_format=AcceptFormat.BYTES,
    )


def test_delete_pdf_pages_empty_indices_raises(platform_handler: PlatformHandler) -> None:
    """delete_pdf_pages raises ValueError when given empty page indices."""
    with pytest.raises(ValueError, match="At least one page index is required"):
        platform_handler.delete_pdf_pages(b"pdf-content", [])


def test_set_pdf_metadata(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """set_pdf_metadata calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"metadata-updated"
    platform_client_mock.run.return_value = mock_response

    metadata: PdfMetadata = {"title": "Test Document", "author": "John Doe"}
    result = platform_handler.set_pdf_metadata(b"pdf-content", metadata)

    assert result == b"metadata-updated"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="metadata",
        params=metadata,
        accept_format=AcceptFormat.BYTES,
    )


def test_set_pdf_metadata_empty_dict_raises(platform_handler: PlatformHandler) -> None:
    """set_pdf_metadata raises ValueError when given empty metadata dict."""
    with pytest.raises(ValueError, match="At least one metadata field must be provided"):
        platform_handler.set_pdf_metadata(b"pdf-content", {})


def test_flatten_pdf(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """flatten_pdf calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"flattened"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.flatten_pdf(b"pdf-content")

    assert result == b"flattened"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method="flatten",
        params={},
        accept_format=AcceptFormat.BYTES,
    )
