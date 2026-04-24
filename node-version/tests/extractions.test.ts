import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../src/tools/extractions.js';
import { GenericFailedError } from '../src/errors.js';
import { createAppContext, type MockFilesHandler, type MockPlatformHandler } from './helpers/fixtures.js';
import { ToolCaller } from './helpers/toolCaller.js';
import type { FilesHandler } from '../src/handlers/filesHandler.js';
import type { PlatformHandler } from '../src/handlers/platformHandler.js';

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

describe('extraction tools', () => {
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

  describe('get_pdf_metadata', () => {
    it('returns output filename', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.getPdfMetadata.mockResolvedValue(Buffer.from('{}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-metadata.json'));

      await caller.call(
        'get_pdf_metadata',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-metadata.json' } },
      );

      expect(filesHandlerMock.read).toHaveBeenCalledWith(path.join(tmpDir, 'doc.pdf'));
      expect(platformHandlerMock.getPdfMetadata).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('{}'),
        { stemSuffix: 'metadata', ext: 'json' },
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.getPdfMetadata.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'get_pdf_metadata',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('extract_pdf_forms', () => {
    it('extracts forms and returns output filename with dataType', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"fields":[]}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-forms.json'));

      await caller.call(
        'extract_pdf_forms',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-forms.json', dataType: 'forms' } },
      );

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'forms',
        { language: 'en' },
      );
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('{"fields":[]}'),
        { stemSuffix: 'forms', ext: 'json' },
      );
    });

    it('passes custom language', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-forms.json'));

      await caller.call('extract_pdf_forms', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        language: 'es',
      });

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'forms',
        { language: 'es' },
      );
    });
  });

  describe('extract_pdf_tables', () => {
    it('extracts tables and returns output filename with dataType', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"tables":[]}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-tables.json'));

      await caller.call(
        'extract_pdf_tables',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-tables.json', dataType: 'tables' } },
      );

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'tables',
        {},
      );
    });

    it('passes page indices when provided', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-tables.json'));

      await caller.call('extract_pdf_tables', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        pageIndices: [0, 1],
      });

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'tables',
        { pageIndices: [0, 1] },
      );
    });
  });

  describe('extract_pdf_text', () => {
    it('extracts text and returns word/character counts', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(
        Buffer.from(JSON.stringify('hello world')),
      );
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-text.txt'));

      await caller.call(
        'extract_pdf_text',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-text.txt', wordCount: 2, characterCount: 11 } },
      );

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'text',
        { readingOrder: false },
      );
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('hello world'),
        { stemSuffix: 'text', ext: 'txt' },
      );
    });

    it('passes page indices and reading order when provided', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from(JSON.stringify('text')));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-text.txt'));

      await caller.call('extract_pdf_text', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        pageIndices: [0],
        readingOrder: true,
      });

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'text',
        { readingOrder: true, pageIndices: [0] },
      );
    });
  });

  describe('extract_pdf_accessibility', () => {
    it('extracts accessibility data and returns output filename with dataType', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-accessibility.json'));

      await caller.call(
        'extract_pdf_accessibility',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-accessibility.json', dataType: 'accessibility' } },
      );

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'accessibility',
        {},
      );
    });
  });

  describe('search_text_in_pdf', () => {
    it('returns total matches and unique texts found', async () => {
      const searchResult = {
        textBoxes: [
          { text: 'hello' },
          { text: 'hello' },
          { text: 'world' },
        ],
      };
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractTextBoundingBoxes.mockResolvedValue(
        Buffer.from(JSON.stringify(searchResult)),
      );
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-search.json'));

      await caller.call(
        'search_text_in_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), texts: ['hello', 'world'] },
        { expectedResult: { outputFilename: 'doc-search.json', totalMatches: 3, uniqueTextsFound: 2 } },
      );

      expect(platformHandlerMock.extractTextBoundingBoxes).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        ['hello', 'world'],
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractTextBoundingBoxes.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'search_text_in_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), texts: ['hello'] },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });
});
