import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../src/tools/extractions.js';
import { GenericFailedError } from '../src/errors.js';
import {
  createAppContext,
  type MockFilesHandler,
  type MockPlatformHandler,
} from './helpers/fixtures.js';
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
      extractPiiBoundingBoxes: vi.fn(),
      redactPdf: vi.fn(),
      watermarkPdf: vi.fn(),
      ocrPdf: vi.fn(),
      optimizePdf: vi.fn(),
      fillForms: vi.fn(),
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

  describe('get_pdf_metadata', () => {
    it('returns metadata json inline by default', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.getPdfMetadata.mockResolvedValue(Buffer.from('{"title":"the-title"}'));

      await caller.call(
        'get_pdf_metadata',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { data: { title: 'the-title' } } },
      );

      expect(filesHandlerMock.read).toHaveBeenCalledWith(path.join(tmpDir, 'doc.pdf'));
      expect(platformHandlerMock.getPdfMetadata).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('writes metadata to file when outputTarget is file', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.getPdfMetadata.mockResolvedValue(Buffer.from('{"title":"the-title"}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-metadata.json'));

      await caller.call(
        'get_pdf_metadata',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputTarget: 'file' },
        { expectedResult: { outputFilename: 'doc-metadata.json' } },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('{"title":"the-title"}'),
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
    it('returns forms JSON inline by default when outputFormat is json', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"fields":[]}'));

      await caller.call(
        'extract_pdf_forms',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputFormat: 'json' },
        { expectedResult: { dataType: 'forms', data: { fields: [] } } },
      );

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'forms',
        { language: 'en' },
      );
      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('writes forms JSON to file when outputTarget is file', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"fields":[]}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-forms.json'));

      await caller.call(
        'extract_pdf_forms',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputFormat: 'json', outputTarget: 'file' },
        { expectedResult: { dataType: 'forms', outputFilename: 'doc-forms.json' } },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('{"fields":[]}'),
        { stemSuffix: 'forms', ext: 'json' },
      );
    });

    it('returns inline and writes file when outputTarget is both', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"fields":[]}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-forms.json'));

      await caller.call(
        'extract_pdf_forms',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputFormat: 'json', outputTarget: 'both' },
        {
          expectedResult: {
            dataType: 'forms',
            data: { fields: [] },
            outputFilename: 'doc-forms.json',
          },
        },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledTimes(1);
    });

    it('extracts forms as Excel by default', async () => {
      const formsData = {
        fields: [{ name: 'field-name', value: 'field-value', confidence: 0.9 }],
        averageConfidence: 0.9,
      };
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from(JSON.stringify(formsData)));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-forms.xlsx'));

      await caller.call(
        'extract_pdf_forms',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-forms.xlsx', dataType: 'forms' } },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        expect.any(Buffer),
        { stemSuffix: 'forms', ext: 'xlsx' },
      );
    });

    it('returns error when Excel requested but no fields', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(
        Buffer.from('{"fields":[],"averageConfidence":0}'),
      );

      await caller.call(
        'extract_pdf_forms',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('passes custom language', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"fields":[]}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-forms.json'));

      await caller.call('extract_pdf_forms', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        language: 'es',
        outputFormat: 'json',
      });

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'forms',
        { language: 'es' },
      );
    });
  });

  describe('extract_pdf_tables', () => {
    it('returns tables JSON inline by default when outputFormat is json', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"tables":[]}'));

      await caller.call(
        'extract_pdf_tables',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputFormat: 'json' },
        { expectedResult: { dataType: 'tables', data: { tables: [] } } },
      );

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'tables',
        {},
      );
      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('writes tables JSON to file when outputTarget is file', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"tables":[]}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-tables.json'));

      await caller.call(
        'extract_pdf_tables',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputFormat: 'json', outputTarget: 'file' },
        { expectedResult: { dataType: 'tables', outputFilename: 'doc-tables.json' } },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('{"tables":[]}'),
        { stemSuffix: 'tables', ext: 'json' },
      );
    });

    it('extracts tables as Excel by default', async () => {
      const tablesData = {
        tables: [
          {
            tableData: { title: 'table-title', cells: [['a', 'b']], averageConfidence: 0.95 },
            pageIndices: [0],
          },
        ],
      };
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from(JSON.stringify(tablesData)));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-tables.xlsx'));

      await caller.call(
        'extract_pdf_tables',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { outputFilename: 'doc-tables.xlsx', dataType: 'tables' } },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        expect.any(Buffer),
        { stemSuffix: 'tables', ext: 'xlsx' },
      );
    });

    it('returns error when Excel requested but no tables', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"tables":[]}'));

      await caller.call(
        'extract_pdf_tables',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('passes page indices when provided', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(Buffer.from('{"tables":[]}'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-tables.json'));

      await caller.call('extract_pdf_tables', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        pageIndices: [0, 1],
        outputFormat: 'json',
      });

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'tables',
        { pageIndices: [0, 1] },
      );
    });
  });

  describe('extract_pdf_text', () => {
    it('returns text inline by default with word/character counts', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(
        Buffer.from(JSON.stringify('hello world')),
      );

      await caller.call(
        'extract_pdf_text',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { wordCount: 2, characterCount: 11, data: 'hello world' } },
      );

      expect(platformHandlerMock.extractPdfData).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'text',
        { readingOrder: false },
      );
      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('writes text file when outputTarget is file', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPdfData.mockResolvedValue(
        Buffer.from(JSON.stringify('hello world')),
      );
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-text.txt'));

      await caller.call(
        'extract_pdf_text',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputTarget: 'file' },
        { expectedResult: { wordCount: 2, characterCount: 11, outputFilename: 'doc-text.txt' } },
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

  describe('extract_invoice_data', () => {
    it('returns invoice data inline by default', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractExpenseData.mockResolvedValue(
        Buffer.from('{"vendor":"vendor-name"}'),
      );

      await caller.call(
        'extract_invoice_data',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectedResult: { data: { vendor: 'vendor-name' } } },
      );

      expect(platformHandlerMock.extractExpenseData).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('writes invoice data to file when outputTarget is file', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractExpenseData.mockResolvedValue(
        Buffer.from('{"vendor":"vendor-name"}'),
      );
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-invoice.json'));

      await caller.call(
        'extract_invoice_data',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputTarget: 'file' },
        { expectedResult: { outputFilename: 'doc-invoice.json' } },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from('{"vendor":"vendor-name"}'),
        { stemSuffix: 'invoice', ext: 'json' },
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractExpenseData.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'extract_invoice_data',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe.skip('extract_pdf_accessibility', () => {
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
    it('returns matches inline by default with summary counts', async () => {
      const searchResult = {
        textBoxes: [{ text: 'hello' }, { text: 'hello' }, { text: 'world' }],
      };
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractTextBoundingBoxes.mockResolvedValue(
        Buffer.from(JSON.stringify(searchResult)),
      );

      await caller.call(
        'search_text_in_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), texts: ['hello', 'world'] },
        {
          expectedResult: {
            totalMatches: 3,
            uniqueTextsFound: 2,
            data: searchResult,
          },
        },
      );

      expect(platformHandlerMock.extractTextBoundingBoxes).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        ['hello', 'world'],
      );
      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('writes search results to file when outputTarget is file', async () => {
      const searchResult = { textBoxes: [{ text: 'hello' }] };
      const buffer = Buffer.from(JSON.stringify(searchResult));
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractTextBoundingBoxes.mockResolvedValue(buffer);
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-search.json'));

      await caller.call(
        'search_text_in_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), texts: ['hello'], outputTarget: 'file' },
        {
          expectedResult: {
            totalMatches: 1,
            uniqueTextsFound: 1,
            outputFilename: 'doc-search.json',
          },
        },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(path.join(tmpDir, 'doc.pdf'), buffer, {
        stemSuffix: 'search',
        ext: 'json',
      });
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
