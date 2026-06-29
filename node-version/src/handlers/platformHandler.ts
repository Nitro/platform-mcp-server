import { z } from 'zod';
import { ContentType, FileFormat } from '../client/enums.js';
import { PlatformApiClient, createBytesFile } from '../client/platformClient.js';
import type { PkceManager } from '../auth/pkceManager.js';
import { checkHttpResponse } from '../errors.js';

const _tokenResponseSchema = z.object({ accessToken: z.string().min(1) });

export const SupportedConversions = {
  fromPdfTo: new Set<FileFormat>([
    FileFormat.DOCX,
    FileFormat.XLSX,
    FileFormat.PPTX,
    FileFormat.JPEG,
    FileFormat.PNG,
    FileFormat.PDFA,
  ]),
  toPdfFrom: new Set<FileFormat>([
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
  ]),
} as const;

export type ExtractionDataType = 'forms' | 'tables' | 'text' | 'accessibility';

export interface ExtractionParams {
  readonly language?: string;
  readonly pageIndices?: number[];
  readonly readingOrder?: boolean;
}

export type PdfPermission =
  | 'print'
  | 'modify'
  | 'copy'
  | 'annotate'
  | 'form'
  | 'assemble'
  | 'print-hq';

export interface PageRotation {
  readonly pageIndex: number;
  readonly amount: number;
}

export interface PdfMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: string;
  readonly creator?: string;
  readonly producer?: string;
  readonly creation_date?: string;
  readonly mod_date?: string;
  readonly trapped?: string;
}

export interface WatermarkParams {
  readonly boundingBox?: number[] | null;
  readonly centerOnPage?: boolean;
  readonly contentDepth?: 'above_existing' | 'below_existing';
  readonly fitToPageWidth?: boolean;
  readonly fitToPageHeight?: boolean;
  readonly flip?: 'horizontal' | 'vertical' | 'both' | null;
  readonly opacity?: number;
  readonly pageIndices?: number[] | null;
  readonly rotateWithPage?: boolean;
  readonly rotation?: number;
}

export interface OcrParams {
  readonly language?:
    | 'english'
    | 'german'
    | 'french'
    | 'spanish'
    | 'italian'
    | 'finnish'
    | 'swedish'
    | 'danish'
    | 'norwegian'
    | 'dutch'
    | 'portuguese'
    | 'brazilian';
  readonly quality?: 'low' | 'medium' | 'high';
  readonly isOutputPDFEditable?: boolean;
  readonly compressionLevel?: 'low' | 'medium' | 'high';
  readonly PDFVersion?: 'pdf14' | 'pdf15' | 'pdf16' | 'pdf17';
  readonly pageIndices?: number[] | null;
}

export interface PdfAParams {
  readonly conformance: '1b' | '1a' | '2b' | '2u' | '2a' | '3b' | '3u' | '3a';
  readonly imageQuality?: number;
  readonly copyMetadata?: boolean;
}

export interface OptimizationParams {
  readonly profile: 'web' | 'print' | 'archive' | 'minimal-file-size' | 'mixed-raster-content';
}

export interface FillFormsParams {
  readonly strict?: boolean;
}

export class ConversionNotSupportedError extends Error {
  constructor(fromFormat: FileFormat, toFormat: FileFormat) {
    super(`Conversion from ${fromFormat} to ${toFormat} is not supported`);
    this.name = 'ConversionNotSupportedError';
  }
}

const FORMAT_TO_CONTENT_TYPE: Record<FileFormat, ContentType> = {
  [FileFormat.PDF]: ContentType.PDF,
  [FileFormat.DOC]: ContentType.DOC,
  [FileFormat.DOCX]: ContentType.DOCX,
  [FileFormat.DOCM]: ContentType.DOCM,
  [FileFormat.DOTX]: ContentType.DOTX,
  [FileFormat.DOTM]: ContentType.DOTM,
  [FileFormat.XLS]: ContentType.XLS,
  [FileFormat.XLSX]: ContentType.XLSX,
  [FileFormat.XLSM]: ContentType.XLSM,
  [FileFormat.XLTX]: ContentType.XLTX,
  [FileFormat.XLTM]: ContentType.XLTM,
  [FileFormat.PPT]: ContentType.PPT,
  [FileFormat.PPTX]: ContentType.PPTX,
  [FileFormat.TXT]: ContentType.TXT,
  [FileFormat.JPG]: ContentType.JPG,
  [FileFormat.JPEG]: ContentType.JPEG,
  [FileFormat.PNG]: ContentType.PNG,
  [FileFormat.TIFF]: ContentType.TIFF,
  [FileFormat.BMP]: ContentType.BMP,
  [FileFormat.GIF]: ContentType.GIF,
  [FileFormat.SVG]: ContentType.SVG,
  [FileFormat.EPS]: ContentType.EPS,
  [FileFormat.PSD]: ContentType.PSD,
  [FileFormat.XML]: ContentType.XML,
  [FileFormat.CSV]: ContentType.CSV,
  [FileFormat.RTF]: ContentType.RTF,
  [FileFormat.HTML]: ContentType.HTML,
  [FileFormat.PDFA]: ContentType.PDF,
};

function _contentTypeForFormat(format: FileFormat): ContentType {
  return FORMAT_TO_CONTENT_TYPE[format];
}

async function _getToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientID: clientId, clientSecret }),
    signal: AbortSignal.timeout(30_000),
  });
  await checkHttpResponse(res);
  const { accessToken } = _tokenResponseSchema.parse(await res.json());
  return accessToken;
}

export class PlatformHandler {
  static readonly supportedConversions = SupportedConversions;

  private readonly _client: PlatformApiClient;

  constructor(client: PlatformApiClient) {
    this._client = client;
  }

  static fromAuthToken(baseUrl: string, token: string): PlatformHandler {
    return new PlatformHandler(PlatformApiClient.fromStaticToken(baseUrl, token));
  }

  static async fromClientCredentials(
    baseUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<PlatformHandler> {
    const token = await _getToken(baseUrl, clientId, clientSecret);
    return PlatformHandler.fromAuthToken(baseUrl, token);
  }

  static fromPkce(apiUrl: string, pkceManager: PkceManager): PlatformHandler {
    return new PlatformHandler(
      PlatformApiClient.fromTokenProvider(apiUrl, () => pkceManager.getAccessToken()),
    );
  }

  private _isValidConversion(fileType: FileFormat, to: FileFormat): boolean {
    return (
      (fileType === FileFormat.PDF && SupportedConversions.fromPdfTo.has(to)) ||
      (to === FileFormat.PDF && SupportedConversions.toPdfFrom.has(fileType))
    );
  }

  async convertFile(
    fileBytes: Buffer,
    fileType: FileFormat,
    to: FileFormat,
    pdfaParams?: PdfAParams,
  ): Promise<Buffer> {
    if (!this._isValidConversion(fileType, to)) {
      throw new ConversionNotSupportedError(fileType, to);
    }

    const contentType = _contentTypeForFormat(fileType);
    const file = createBytesFile(contentType, fileBytes, `input.${fileType}`);

    const { body } = await this._client.run('conversions', file, {
      method: null,
      params: { to, ...pdfaParams },
    });

    return body;
  }

  private _extractResult(body: Buffer): Buffer {
    const parsed: unknown = JSON.parse(body.toString());
    if (typeof parsed !== 'object' || parsed === null || !('result' in parsed)) {
      throw new Error('Unexpected extraction response shape');
    }
    return Buffer.from(JSON.stringify((parsed as Record<string, unknown>).result, null, 2));
  }

  async getPdfMetadata(fileBytes: Buffer): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'document.pdf');
    const { body } = await this._client.run('extractions', file, {
      method: 'get-properties',
      params: {},
      acceptFormat: 'json',
    });
    return this._extractResult(body);
  }

  async extractPdfData(
    fileBytes: Buffer,
    dataType: ExtractionDataType,
    params: ExtractionParams,
  ): Promise<Buffer> {
    const methodMap: Record<ExtractionDataType, string> = {
      forms: 'extract-forms',
      tables: 'extract-tables',
      text: 'extract-text',
      accessibility: 'extract-accessibility-data',
    };

    const file = createBytesFile(ContentType.PDF, fileBytes, 'document.pdf');
    const { body } = await this._client.run('extractions', file, {
      method: methodMap[dataType],
      params: params as Record<string, unknown>,
      acceptFormat: 'json',
    });
    return this._extractResult(body);
  }

  async extractTextBoundingBoxes(
    fileBytes: Buffer,
    queries: { text: string; isRegex?: boolean | undefined; regexFlags?: string[] | undefined }[],
  ): Promise<Buffer> {
    const wireQueries = queries.map((q) => {
      const query: { text: string; isRegex?: boolean; regexFlags?: string[] } = { text: q.text };
      if (q.isRegex) {
        query.isRegex = true;
        if (q.regexFlags && q.regexFlags.length > 0) {
          query.regexFlags = q.regexFlags;
        }
      }
      return query;
    });
    const file = createBytesFile(ContentType.PDF, fileBytes, 'document.pdf');
    const { body } = await this._client.run('extractions', file, {
      method: 'extract-text-bounding-boxes',
      params: { queries: wireQueries },
      acceptFormat: 'json',
    });
    return this._extractResult(body);
  }

  async extractPiiBoundingBoxes(fileBytes: Buffer, language: 'en' | 'es'): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'document.pdf');
    const { body } = await this._client.run('extractions', file, {
      method: 'extract-pii-bounding-boxes',
      params: { language },
      acceptFormat: 'json',
    });
    return this._extractResult(body);
  }

  async mergePdfs(fileBuffers: Buffer[], tableOfContents = true): Promise<Buffer> {
    const files = fileBuffers.map((content, i) =>
      createBytesFile(ContentType.PDF, content, `document_${String(i)}.pdf`),
    );
    const { body } = await this._client.run('transformations', files, {
      method: 'merge',
      params: { tableOfContents: { enabled: tableOfContents } },
    });
    return body;
  }

  async splitPdf(fileBytes: Buffer, pageRanges: number[][]): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'split',
      params: { pageIndices: pageRanges },
    });
    return body;
  }

  async rotatePdf(fileBytes: Buffer, rotations: PageRotation[]): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'rotate',
      params: { rotations },
    });
    return body;
  }

  async protectPdf(
    fileBytes: Buffer,
    ownerPassword?: string,
    userPassword?: string,
    permissions?: PdfPermission[],
  ): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const params: Record<string, unknown> = {};
    if (ownerPassword !== undefined) params.ownerPassword = ownerPassword;
    if (userPassword !== undefined) params.userPassword = userPassword;
    if (permissions !== undefined) params.permissions = permissions;
    const { body } = await this._client.run('transformations', file, {
      method: 'protect',
      params,
    });
    return body;
  }

  async unprotectPdf(
    fileBytes: Buffer,
    ownerPassword?: string,
    userPassword?: string,
  ): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const params: Record<string, unknown> = {};
    if (ownerPassword !== undefined) params.ownerPassword = ownerPassword;
    if (userPassword !== undefined) params.userPassword = userPassword;
    const { body } = await this._client.run('transformations', file, {
      method: 'unprotect',
      params,
    });
    return body;
  }

  async deletePdfPages(fileBytes: Buffer, pageIndices: number[]): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'delete-pages',
      params: { pageIndices },
    });
    return body;
  }

  async setPdfMetadata(fileBytes: Buffer, metadata: PdfMetadata): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'set-properties',
      params: metadata as Record<string, unknown>,
    });
    return body;
  }

  async flattenPdf(fileBytes: Buffer): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'flatten',
      params: {},
    });
    return body;
  }

  async redactPdf(
    fileBytes: Buffer,
    redactions: { pageIndex: number; boundingBox: number[] }[],
  ): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'redact',
      params: { redactions },
    });
    return body;
  }

  async watermarkPdf(
    pdfBytes: Buffer,
    imageBytes: Buffer,
    imageContentType: ContentType,
    params: WatermarkParams,
  ): Promise<Buffer> {
    const pdfFile = createBytesFile(ContentType.PDF, pdfBytes, 'input.pdf');
    const imageFile = createBytesFile(imageContentType, imageBytes, 'watermark');
    const { body } = await this._client.run('transformations', [pdfFile, imageFile], {
      method: 'watermark',
      params: params as Record<string, unknown>,
    });
    return body;
  }

  async ocrPdf(fileBytes: Buffer, params: OcrParams): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'ocr',
      params: params as Record<string, unknown>,
    });
    return body;
  }

  async optimizePdf(fileBytes: Buffer, params: OptimizationParams): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'optimize',
      params: params as unknown as Record<string, unknown>,
    });
    return body;
  }

  async compressPdf(fileBytes: Buffer): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const { body } = await this._client.run('transformations', file, {
      method: 'compress',
      params: {},
    });
    return body;
  }

  async fillForms(
    fileBytes: Buffer,
    dataBytes: Buffer,
    dataFormat: 'csv' | 'json' | 'xfdf' | 'fdf',
    params: FillFormsParams,
  ): Promise<Buffer> {
    const pdfFile = createBytesFile(ContentType.PDF, fileBytes, 'input.pdf');
    const dataFileByFormat = {
      csv: { contentType: ContentType.CSV, name: 'fields.csv' },
      json: { contentType: ContentType.JSON, name: 'fields.json' },
      xfdf: { contentType: ContentType.XFDF, name: 'fields.xfdf' },
      fdf: { contentType: ContentType.FDF, name: 'fields.fdf' },
    }[dataFormat];
    const dataFile = createBytesFile(
      dataFileByFormat.contentType,
      dataBytes,
      dataFileByFormat.name,
    );
    const { body } = await this._client.run('generations', [pdfFile, dataFile], {
      method: 'fill-forms',
      params: params as Record<string, unknown>,
    });
    return body;
  }

  async extractExpenseData(fileBytes: Buffer): Promise<Buffer> {
    const file = createBytesFile(ContentType.PDF, fileBytes, 'document.pdf');
    const { body } = await this._client.run('extractions', file, {
      method: 'extract-invoices',
      params: {},
      acceptFormat: 'json',
    });
    return this._extractResult(body);
  }
}
