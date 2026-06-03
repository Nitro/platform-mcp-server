export const ContentType = {
  PDF: 'application/pdf',
  DOC: 'application/msword',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  DOCM: 'application/vnd.ms-word.document.macroEnabled.12',
  DOTX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  DOTM: 'application/vnd.ms-word.template.macroEnabled.12',
  XLS: 'application/vnd.ms-excel',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  XLSM: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  XLTX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  XLTM: 'application/vnd.ms-excel.template.macroEnabled.12',
  PPT: 'application/vnd.ms-powerpoint',
  PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  TXT: 'text/plain',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  TIFF: 'image/tiff',
  BMP: 'image/bmp',
  GIF: 'image/gif',
  SVG: 'image/svg+xml',
  EPS: 'application/postscript',
  PSD: 'image/vnd.adobe.photoshop',
  XML: 'application/xml',
  CSV: 'text/csv',
  RTF: 'application/rtf',
  HTML: 'text/html',
  ZIP: 'application/zip',
  OCTET_STREAM: 'application/octet-stream',
} as const;

export type ContentType = (typeof ContentType)[keyof typeof ContentType];

export const FileFormat = {
  PDF: 'pdf',
  DOC: 'doc',
  DOCX: 'docx',
  DOCM: 'docm',
  DOTX: 'dotx',
  DOTM: 'dotm',
  XLS: 'xls',
  XLSX: 'xlsx',
  XLSM: 'xlsm',
  XLTX: 'xltx',
  XLTM: 'xltm',
  PPT: 'ppt',
  PPTX: 'pptx',
  TXT: 'txt',
  JPG: 'jpg',
  JPEG: 'jpeg',
  PNG: 'png',
  TIFF: 'tiff',
  BMP: 'bmp',
  GIF: 'gif',
  SVG: 'svg',
  EPS: 'eps',
  PSD: 'psd',
  XML: 'xml',
  CSV: 'csv',
  RTF: 'rtf',
  HTML: 'html',
  PDFA: 'pdfa',
} as const;

export type FileFormat = (typeof FileFormat)[keyof typeof FileFormat];

export const CompressionLevel = {
  LIGHT: 'light',
  MEDIUM: 'medium',
  HEAVY: 'heavy',
} as const;

export type CompressionLevel = (typeof CompressionLevel)[keyof typeof CompressionLevel];

export const fileFormatValues = new Set<string>(Object.values(FileFormat));

export function isFileFormat(value: string): value is FileFormat {
  return fileFormatValues.has(value);
}
