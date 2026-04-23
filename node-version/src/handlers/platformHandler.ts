import { z } from 'zod';
import { ContentType, FileFormat } from '../client/enums.js';
import { PlatformApiClient, createBytesFile } from '../client/platformClient.js';
import { checkHttpResponse } from '../errors.js';

const _tokenResponseSchema = z.object({ accessToken: z.string().min(1) });

export const SupportedConversions = {
  fromPdfTo: new Set<FileFormat>([
    FileFormat.DOCX,
    FileFormat.XLSX,
    FileFormat.PPTX,
    FileFormat.JPEG,
    FileFormat.PNG,
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
};

function _contentTypeForFormat(format: FileFormat): ContentType {
  return FORMAT_TO_CONTENT_TYPE[format];
}

async function _getToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientID: clientId, clientSecret }),
    signal: AbortSignal.timeout(30_000),
  });
  checkHttpResponse(res);
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
    return new PlatformHandler(new PlatformApiClient(baseUrl, token));
  }

  static async fromClientCredentials(
    baseUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<PlatformHandler> {
    const token = await _getToken(baseUrl, clientId, clientSecret);
    return PlatformHandler.fromAuthToken(baseUrl, token);
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
  ): Promise<Buffer> {
    if (!this._isValidConversion(fileType, to)) {
      throw new ConversionNotSupportedError(fileType, to);
    }

    const contentType = _contentTypeForFormat(fileType);
    const file = createBytesFile(contentType, fileBytes, `input.${fileType}`);

    const { body } = await this._client.run('conversions', file, {
      method: null,
      params: { to },
    });

    return body;
  }
}
