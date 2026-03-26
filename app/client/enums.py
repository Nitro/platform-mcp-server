# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Enums for platform MCP server"""

from enum import StrEnum


class ContentType(StrEnum):
    """Content types for file operations"""

    PDF = "application/pdf"
    DOC = "application/msword"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    DOCM = "application/vnd.ms-word.document.macroEnabled.12"
    DOTX = "application/vnd.openxmlformats-officedocument.wordprocessingml.template"
    DOTM = "application/vnd.ms-word.template.macroEnabled.12"
    XLS = "application/vnd.ms-excel"
    XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12"
    XLTX = "application/vnd.openxmlformats-officedocument.spreadsheetml.template"
    XLTM = "application/vnd.ms-excel.template.macroEnabled.12"
    PPT = "application/vnd.ms-powerpoint"
    PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    TXT = "text/plain"
    JPG = "image/jpeg"
    JPEG = "image/jpeg"
    PNG = "image/png"
    TIFF = "image/tiff"
    BMP = "image/bmp"
    GIF = "image/gif"
    SVG = "image/svg+xml"
    EPS = "application/postscript"
    PSD = "image/vnd.adobe.photoshop"
    XML = "application/xml"
    CSV = "text/csv"
    RTF = "application/rtf"
    HTML = "text/html"
    ZIP = "application/zip"
    OCTET_STREAM = "application/octet-stream"


class FileFormat(StrEnum):
    """File formats supported for conversion"""

    PDF = "pdf"
    DOC = "doc"
    DOCX = "docx"
    DOCM = "docm"
    DOTX = "dotx"
    DOTM = "dotm"
    XLS = "xls"
    XLSX = "xlsx"
    XLSM = "xlsm"
    XLTX = "xltx"
    XLTM = "xltm"
    PPT = "ppt"
    PPTX = "pptx"
    TXT = "txt"
    JPG = "jpg"
    JPEG = "jpeg"
    PNG = "png"
    TIFF = "tiff"
    BMP = "bmp"
    GIF = "gif"
    SVG = "svg"
    EPS = "eps"
    PSD = "psd"
    XML = "xml"
    CSV = "csv"
    RTF = "rtf"
    HTML = "html"


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


class CompressionLevel(StrEnum):
    """PDF compression levels for file size optimization"""

    LIGHT = "light"
    MEDIUM = "medium"
    HEAVY = "heavy"
