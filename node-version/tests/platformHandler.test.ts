import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformHandler, ConversionNotSupportedError } from '../src/handlers/platformHandler.js';
import { PlatformApiClient } from '../src/client/platformClient.js';
import { FileFormat } from '../src/client/enums.js';
import { ContentType } from '../src/client/enums.js';

describe('PlatformHandler', () => {
  let clientMock: PlatformApiClient;
  let runMock: ReturnType<typeof vi.fn>;
  let handler: PlatformHandler;

  beforeEach(() => {
    runMock = vi.fn();
    clientMock = {
      run: runMock,
    } as unknown as PlatformApiClient;
    handler = new PlatformHandler(clientMock);
  });

  describe('getPdfMetadata', () => {
    it('calls extractions with get-properties and returns extracted result', async () => {
      const rawResponse = JSON.stringify({ result: { title: 'doc-title' } });
      runMock.mockResolvedValueOnce({ body: Buffer.from(rawResponse), contentType: 'application/json' });

      const result = await handler.getPdfMetadata(Buffer.from('pdf-bytes'));

      expect(result).toEqual(Buffer.from(JSON.stringify({ title: 'doc-title' }, null, 2)));
      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF, name: 'document.pdf' }),
        { method: 'get-properties', params: {} },
      );
    });
  });

  describe('extractPdfData', () => {
    it.each([
      ['forms', 'extract-forms'],
      ['tables', 'extract-tables'],
      ['text', 'extract-text'],
      ['accessibility', 'extract-accessibility-data'],
    ] as const)('calls correct method for %s', async (dataType, expectedMethod) => {
      const rawResponse = JSON.stringify({ result: {} });
      runMock.mockResolvedValueOnce({ body: Buffer.from(rawResponse), contentType: 'application/json' });

      await handler.extractPdfData(Buffer.from('pdf-bytes'), dataType, {});

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        expect.objectContaining({ method: expectedMethod }),
      );
    });

    it('passes params to client', async () => {
      const rawResponse = JSON.stringify({ result: [] });
      runMock.mockResolvedValueOnce({ body: Buffer.from(rawResponse), contentType: 'application/json' });

      await handler.extractPdfData(Buffer.from('pdf-bytes'), 'tables', { pageIndices: [0, 1] });

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.anything(),
        expect.objectContaining({ params: { pageIndices: [0, 1] } }),
      );
    });
  });

  describe('extractTextBoundingBoxes', () => {
    it('calls extract-text-bounding-boxes with texts param', async () => {
      const rawResponse = JSON.stringify({ result: { textBoxes: [] } });
      runMock.mockResolvedValueOnce({ body: Buffer.from(rawResponse), contentType: 'application/json' });

      await handler.extractTextBoundingBoxes(Buffer.from('pdf-bytes'), ['hello', 'world']);

      expect(runMock).toHaveBeenCalledWith(
        'extractions',
        expect.objectContaining({ kind: 'bytes', contentType: ContentType.PDF }),
        { method: 'extract-text-bounding-boxes', params: { texts: ['hello', 'world'] } },
      );
    });
  });

  describe('convertFile', () => {
    it('converts pdf to docx and returns result bytes', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('converted-bytes'),
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const result = await handler.convertFile(
        Buffer.from('pdf-bytes'),
        FileFormat.PDF,
        FileFormat.DOCX,
      );

      expect(result).toEqual(Buffer.from('converted-bytes'));
      expect(runMock).toHaveBeenCalledWith(
        'conversions',
        expect.objectContaining({ kind: 'bytes', name: 'input.pdf' }),
        { method: null, params: { to: FileFormat.DOCX } },
      );
    });

    it('throws ConversionNotSupportedError for unsupported conversion', async () => {
      await expect(
        handler.convertFile(Buffer.from('bytes'), FileFormat.PDF, FileFormat.PDF),
      ).rejects.toThrow(ConversionNotSupportedError);
      expect(runMock).not.toHaveBeenCalled();
    });

    it('converts docx to pdf', async () => {
      runMock.mockResolvedValueOnce({
        body: Buffer.from('pdf-output'),
        contentType: 'application/pdf',
      });

      const result = await handler.convertFile(
        Buffer.from('docx-bytes'),
        FileFormat.DOCX,
        FileFormat.PDF,
      );

      expect(result).toEqual(Buffer.from('pdf-output'));
      expect(runMock).toHaveBeenCalledWith(
        'conversions',
        expect.objectContaining({ kind: 'bytes', name: 'input.docx' }),
        { method: null, params: { to: FileFormat.PDF } },
      );
    });
  });
});
