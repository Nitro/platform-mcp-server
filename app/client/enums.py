# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Enums for platform MCP server"""

from enum import StrEnum


class ContentType(StrEnum):
    """Content types for file operations"""

    PDF = "application/pdf"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    TXT = "text/plain"
    JPEG = "image/jpeg"
    PNG = "image/png"
    TIFF = "image/tiff"
    BMP = "image/bmp"
    GIF = "image/gif"
    ZIP = "application/zip"
    OCTET_STREAM = "application/octet-stream"


class FileFormat(StrEnum):
    """File formats supported for conversion"""

    PDF = "pdf"
    DOCX = "docx"
    XLSX = "xlsx"
    PPTX = "pptx"
    TXT = "txt"
    JPG = "jpg"
    JPEG = "jpeg"
    PNG = "png"
    TIFF = "tiff"
    BMP = "bmp"
    GIF = "gif"


class RotationAmount(StrEnum):
    """Valid PDF rotation amounts in degrees"""

    ROTATE_90 = "90"
    ROTATE_180 = "180"
    ROTATE_270 = "270"
    ROTATE_MINUS_90 = "-90"
    ROTATE_MINUS_180 = "-180"
    ROTATE_MINUS_270 = "-270"

    @classmethod
    def valid_amounts(cls) -> list[int]:
        """Return list of valid rotation amounts as integers"""
        return [int(amount.value) for amount in cls]
