import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentType } from '../src/client/enums.js';
import { GenericFailedError, UserFacingError } from '../src/errors.js';
import type { FilesHandler } from '../src/handlers/filesHandler.js';
import type { PlatformHandler } from '../src/handlers/platformHandler.js';
import { register } from '../src/tools/transformations.js';
import {
  createAppContext,
  type MockFilesHandler,
  type MockPlatformHandler,
} from './helpers/fixtures.js';
import { ToolCaller } from './helpers/toolCaller.js';

async function _createToolCaller(
  context: ReturnType<typeof createAppContext>,
): Promise<{ caller: ToolCaller; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, context);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    caller: new ToolCaller(client),
    cleanup: async (): Promise<void> => {
      await client.close();
    },
  };
}

describe('transformation tools', () => {
  let filesHandlerMock: MockFilesHandler;
  let platformHandlerMock: MockPlatformHandler;
  let caller: ToolCaller;
  let cleanup: () => Promise<void>;
  const tmpDir = '/tmp/test-dir';

  beforeEach(async () => {
    filesHandlerMock = {
      read: vi.fn(),
      write: vi.fn(),
      listFiles: vi.fn(),
    };
    platformHandlerMock = {
      convertFile: vi.fn(),
      getPdfMetadata: vi.fn(),
      extractPdfData: vi.fn(),
      extractTextBoundingBoxes: vi.fn(),
      mergePdfs: vi.fn(),
      compressPdf: vi.fn(),
      splitPdf: vi.fn(),
      rotatePdf: vi.fn(),
      protectPdf: vi.fn(),
      unprotectPdf: vi.fn(),
      deletePdfPages: vi.fn(),
      setPdfMetadata: vi.fn(),
      flattenPdf: vi.fn(),
      extractPiiBoundingBoxes: vi.fn(),
      redactPdf: vi.fn(),
      watermarkPdf: vi.fn(),
      ocrPdf: vi.fn(),
      extractExpenseData: vi.fn(),
    };
    const context = createAppContext({
      filesHandler: filesHandlerMock as unknown as FilesHandler,
      platformHandler: platformHandlerMock as unknown as PlatformHandler,
    });
    ({ caller, cleanup } = await _createToolCaller(context));
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  describe('merge_files', () => {
    it('merges files and returns stats', async () => {
      filesHandlerMock.read
        .mockReturnValueOnce(Buffer.from('pdf-one'))
        .mockReturnValueOnce(Buffer.from('pdf-two'));
      platformHandlerMock.mergePdfs.mockResolvedValue(Buffer.from('merged-output'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'a-merged.pdf'));

      await caller.call(
        'merge_files',
        { inputPaths: [path.join(tmpDir, 'a.pdf'), path.join(tmpDir, 'b.pdf')] },
        {
          expectedResult: {
            outputFilename: 'a-merged.pdf',
            inputCount: 2,
            totalInputSizeBytes: 14,
            outputSizeBytes: 13,
          },
        },
      );

      expect(platformHandlerMock.mergePdfs).toHaveBeenCalledWith([
        Buffer.from('pdf-one'),
        Buffer.from('pdf-two'),
      ]);
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'a.pdf'),
        Buffer.from('merged-output'),
        { stemSuffix: 'merged', ext: 'pdf' },
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.mergePdfs.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'merge_files',
        { inputPaths: [path.join(tmpDir, 'a.pdf'), path.join(tmpDir, 'b.pdf')] },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('compress_file', () => {
    it('compresses with default medium level and returns size info', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.alloc(1000));
      platformHandlerMock.compressPdf.mockResolvedValue(Buffer.alloc(800));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-compressed-medium.pdf'));

      await caller.call(
        'compress_file',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        {
          expectedResult: {
            outputFilename: 'doc-compressed-medium.pdf',
            originalSizeBytes: 1000,
            compressedSizeBytes: 800,
            reductionPercent: 20,
          },
        },
      );

      expect(platformHandlerMock.compressPdf).toHaveBeenCalledWith(Buffer.alloc(1000), 'medium');
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.alloc(800),
        { stemSuffix: 'compressed-medium', ext: 'pdf' },
      );
    });

    it('passes custom compression level', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.alloc(1000));
      platformHandlerMock.compressPdf.mockResolvedValue(Buffer.alloc(500));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-compressed-heavy.pdf'));

      await caller.call('compress_file', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        level: 'heavy',
      });

      expect(platformHandlerMock.compressPdf).toHaveBeenCalledWith(Buffer.alloc(1000), 'heavy');
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        expect.anything(),
        { stemSuffix: 'compressed-heavy', ext: 'pdf' },
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.compressPdf.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'compress_file',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('split_pdf', () => {
    it('parses page ranges and returns zip with split count', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.splitPdf.mockResolvedValue(Buffer.from('zip-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-split.zip'));

      await caller.call(
        'split_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), pageRanges: ['1-3', '5'] },
        { expectedResult: { outputFilename: 'doc-split.zip', splitCount: 2 } },
      );

      expect(platformHandlerMock.splitPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), [
        [0, 1, 2],
        [4],
      ]);
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('zip-bytes'),
        { stemSuffix: 'split', ext: 'zip' },
      );
    });

    it('returns error for invalid page range', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));

      await caller.call(
        'split_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), pageRanges: ['3-1'] },
        { expectError: true },
      );

      expect(platformHandlerMock.splitPdf).not.toHaveBeenCalled();
    });
  });

  describe('rotate_pdf', () => {
    it('converts 1-indexed page numbers to 0-indexed and calls handler', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.rotatePdf.mockResolvedValue(Buffer.from('rotated'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-rotated.pdf'));

      await caller.call(
        'rotate_pdf',
        {
          inputPath: path.join(tmpDir, 'doc.pdf'),
          rotations: [
            { pageNumber: 1, amount: 90 },
            { pageNumber: 3, amount: 180 },
          ],
        },
        { expectedResult: { outputFilename: 'doc-rotated.pdf', rotationCount: 2 } },
      );

      expect(platformHandlerMock.rotatePdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), [
        { pageIndex: 0, amount: 90 },
        { pageIndex: 2, amount: 180 },
      ]);
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.rotatePdf.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'rotate_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), rotations: [{ pageNumber: 1, amount: 90 }] },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('protect_pdf', () => {
    it('protects with both passwords and returns password flags', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.protectPdf.mockResolvedValue(Buffer.from('protected'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-protected.pdf'));

      await caller.call(
        'protect_pdf',
        {
          inputPath: path.join(tmpDir, 'doc.pdf'),
          ownerPassword: 'owner-pass',
          userPassword: 'user-pass',
        },
        {
          expectedResult: {
            outputFilename: 'doc-protected.pdf',
            hasOwnerPassword: true,
            hasUserPassword: true,
          },
        },
      );

      expect(platformHandlerMock.protectPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'owner-pass',
        'user-pass',
        undefined,
      );
    });

    it('returns error when no password is provided', async () => {
      await caller.call(
        'protect_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(platformHandlerMock.protectPdf).not.toHaveBeenCalled();
    });

    it('passes permissions when provided', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.protectPdf.mockResolvedValue(Buffer.from('protected'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-protected.pdf'));

      await caller.call('protect_pdf', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        ownerPassword: 'owner-pass',
        permissions: ['print', 'copy'],
      });

      expect(platformHandlerMock.protectPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'owner-pass',
        undefined,
        ['print', 'copy'],
      );
    });
  });

  describe('unprotect_pdf', () => {
    it('unprotects with owner password', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.unprotectPdf.mockResolvedValue(Buffer.from('unprotected'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-unprotected.pdf'));

      await caller.call(
        'unprotect_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), ownerPassword: 'owner-pass' },
        { expectedResult: { outputFilename: 'doc-unprotected.pdf' } },
      );

      expect(platformHandlerMock.unprotectPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'owner-pass',
        undefined,
      );
    });

    it('returns error when no password is provided', async () => {
      await caller.call(
        'unprotect_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(platformHandlerMock.unprotectPdf).not.toHaveBeenCalled();
    });
  });

  describe('delete_pdf_pages', () => {
    it('parses page numbers and ranges, deduplicates, and sorts', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.deletePdfPages.mockResolvedValue(Buffer.from('modified'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-pages-deleted.pdf'));

      await caller.call(
        'delete_pdf_pages',
        { inputPath: path.join(tmpDir, 'doc.pdf'), pageNumbers: ['1', '3-5', '3'] },
        { expectedResult: { outputFilename: 'doc-pages-deleted.pdf', pagesDeleted: 4 } },
      );

      expect(platformHandlerMock.deletePdfPages).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        [0, 2, 3, 4],
      );
    });

    it('returns error for invalid page number', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));

      await caller.call(
        'delete_pdf_pages',
        { inputPath: path.join(tmpDir, 'doc.pdf'), pageNumbers: ['0'] },
        { expectError: true },
      );

      expect(platformHandlerMock.deletePdfPages).not.toHaveBeenCalled();
    });
  });

  describe('set_pdf_metadata', () => {
    it('sets metadata fields and returns count of fields updated', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.setPdfMetadata.mockResolvedValue(Buffer.from('modified'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-metadata-updated.pdf'));

      await caller.call(
        'set_pdf_metadata',
        {
          inputPath: path.join(tmpDir, 'doc.pdf'),
          title: 'doc-title',
          author: 'doc-author',
        },
        { expectedResult: { outputFilename: 'doc-metadata-updated.pdf', fieldsUpdated: 2 } },
      );

      expect(platformHandlerMock.setPdfMetadata).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {
        title: 'doc-title',
        author: 'doc-author',
      });
    });

    it('maps camelCase tool fields to snake_case API fields', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.setPdfMetadata.mockResolvedValue(Buffer.from('modified'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-metadata-updated.pdf'));

      await caller.call('set_pdf_metadata', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        creationDate: 'D:20240101000000',
        modDate: 'D:20240201000000',
      });

      expect(platformHandlerMock.setPdfMetadata).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {
        creation_date: 'D:20240101000000',
        mod_date: 'D:20240201000000',
      });
    });

    it('returns error when no metadata fields are provided', async () => {
      await caller.call(
        'set_pdf_metadata',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(platformHandlerMock.setPdfMetadata).not.toHaveBeenCalled();
    });
  });

  describe('flatten_pdf', () => {
    it('flattens and returns output filename', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.flattenPdf.mockResolvedValue(Buffer.from('flattened'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-flattened.pdf'));

      await caller.call(
        'flatten_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-flattened.pdf' } },
      );

      expect(platformHandlerMock.flattenPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('flattened'),
        { stemSuffix: 'flattened', ext: 'pdf' },
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.flattenPdf.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'flatten_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('watermark_pdf', () => {
    it('applies watermark with minimal params and returns output filename', async () => {
      filesHandlerMock.read
        .mockReturnValueOnce(Buffer.from('pdf-bytes'))
        .mockReturnValueOnce(Buffer.from('image-bytes'));
      platformHandlerMock.watermarkPdf.mockResolvedValue(Buffer.from('watermarked'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-watermarked.pdf'));

      await caller.call(
        'watermark_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), imagePath: path.join(tmpDir, 'watermark.png') },
        { expectedResult: { outputFilename: 'doc-watermarked.pdf' } },
      );

      expect(platformHandlerMock.watermarkPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from('image-bytes'),
        ContentType.PNG,
        {},
      );
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('watermarked'),
        { stemSuffix: 'watermarked', ext: 'pdf' },
      );
    });

    it('passes all positioning and rendering params to the handler', async () => {
      filesHandlerMock.read
        .mockReturnValueOnce(Buffer.from('pdf-bytes'))
        .mockReturnValueOnce(Buffer.from('image-bytes'));
      platformHandlerMock.watermarkPdf.mockResolvedValue(Buffer.from('watermarked'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-watermarked.pdf'));

      await caller.call('watermark_pdf', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        imagePath: path.join(tmpDir, 'watermark.png'),
        boundingBox: [100, 100, 200, 120],
        centerOnPage: true,
        contentDepth: 'above_existing',
        fitToPageWidth: false,
        fitToPageHeight: false,
        flip: 'horizontal',
        opacity: 0.5,
        rotateWithPage: true,
        rotation: 45,
      });

      expect(platformHandlerMock.watermarkPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from('image-bytes'),
        ContentType.PNG,
        {
          boundingBox: [100, 100, 200, 120],
          centerOnPage: true,
          contentDepth: 'above_existing',
          fitToPageWidth: false,
          fitToPageHeight: false,
          flip: 'horizontal',
          opacity: 0.5,
          rotateWithPage: true,
          rotation: 45,
        },
      );
    });

    it('converts 1-indexed page numbers to 0-indexed pageIndices', async () => {
      filesHandlerMock.read
        .mockReturnValueOnce(Buffer.from('pdf-bytes'))
        .mockReturnValueOnce(Buffer.from('image-bytes'));
      platformHandlerMock.watermarkPdf.mockResolvedValue(Buffer.from('watermarked'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-watermarked.pdf'));

      await caller.call('watermark_pdf', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        imagePath: path.join(tmpDir, 'watermark.png'),
        pageNumbers: ['1', '3-5'],
      });

      expect(platformHandlerMock.watermarkPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from('image-bytes'),
        ContentType.PNG,
        { pageIndices: [0, 2, 3, 4] },
      );
    });

    it('returns error for unsupported image format', async () => {
      filesHandlerMock.read.mockReturnValueOnce(Buffer.from('pdf-bytes'));

      await caller.call(
        'watermark_pdf',
        {
          inputPath: path.join(tmpDir, 'doc.pdf'),
          imagePath: path.join(tmpDir, 'watermark.psd'),
        },
        { expectError: true },
      );

      expect(platformHandlerMock.watermarkPdf).not.toHaveBeenCalled();
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read
        .mockReturnValueOnce(Buffer.from('pdf-bytes'))
        .mockReturnValueOnce(Buffer.from('image-bytes'));
      platformHandlerMock.watermarkPdf.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'watermark_pdf',
        {
          inputPath: path.join(tmpDir, 'doc.pdf'),
          imagePath: path.join(tmpDir, 'watermark.png'),
        },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('ocr_pdf', () => {
    it('applies OCR with minimal params and returns output filename', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.ocrPdf.mockResolvedValue(Buffer.from('ocr-output'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-ocr.pdf'));

      await caller.call(
        'ocr_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-ocr.pdf' } },
      );

      expect(platformHandlerMock.ocrPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {});
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('ocr-output'),
        { stemSuffix: 'ocr', ext: 'pdf' },
      );
    });

    it('passes all params to the handler, mapping pdfVersion to PDFVersion', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.ocrPdf.mockResolvedValue(Buffer.from('ocr-output'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-ocr.pdf'));

      await caller.call('ocr_pdf', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        language: 'french',
        quality: 'low',
        isOutputPDFEditable: true,
        compressionLevel: 'high',
        pdfVersion: 'pdf14',
      });

      expect(platformHandlerMock.ocrPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {
        language: 'french',
        quality: 'low',
        isOutputPDFEditable: true,
        compressionLevel: 'high',
        PDFVersion: 'pdf14',
      });
    });

    it('converts 1-indexed page numbers to 0-indexed pageIndices', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.ocrPdf.mockResolvedValue(Buffer.from('ocr-output'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-ocr.pdf'));

      await caller.call('ocr_pdf', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        pageNumbers: ['1', '3-4'],
      });

      expect(platformHandlerMock.ocrPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {
        pageIndices: [0, 2, 3],
      });
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.ocrPdf.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'ocr_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('surfaces UserFacingError message to the caller', async () => {
      filesHandlerMock.read.mockImplementation(() => {
        throw new UserFacingError('File does not exist: /tmp/test-dir/doc.pdf');
      });

      const result = await caller.call(
        'flatten_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(result.content).toEqual([
        { type: 'text', text: 'File does not exist: /tmp/test-dir/doc.pdf' },
      ]);
    });
  });
});
