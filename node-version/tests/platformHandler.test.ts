import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformHandler, ConversionNotSupportedError } from '../src/handlers/platformHandler.js';
import { PlatformApiClient } from '../src/client/platformClient.js';
import { FileFormat } from '../src/client/enums.js';

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
