import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../src/tools/pii.js';
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

describe('PII tools', () => {
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
      extractPiiBoundingBoxes: vi.fn(),
      mergePdfs: vi.fn(),
      splitPdf: vi.fn(),
      rotatePdf: vi.fn(),
      protectPdf: vi.fn(),
      unprotectPdf: vi.fn(),
      deletePdfPages: vi.fn(),
      setPdfMetadata: vi.fn(),
      flattenPdf: vi.fn(),
      redactPdf: vi.fn(),
      watermarkPdf: vi.fn(),
      ocrPdf: vi.fn(),
      optimizePdf: vi.fn(),
      compressPdf: vi.fn(),
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

  describe('extract_pii', () => {
    const piiResult = {
      PIIBoxes: [
        {
          PIIType: 'EMAIL',
          text: 'a@b.com',
          confidence: 0.9,
          pageIndex: 0,
          boundingBox: [0, 0, 10, 10],
        },
        {
          PIIType: 'EMAIL',
          text: 'c@d.com',
          confidence: 0.8,
          pageIndex: 1,
          boundingBox: [0, 0, 10, 10],
        },
        {
          PIIType: 'NAME',
          text: 'Jane',
          confidence: 1.0,
          pageIndex: 0,
          boundingBox: [0, 0, 10, 10],
        },
      ],
    };

    it('returns stats and detections inline by default', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPiiBoundingBoxes.mockResolvedValue(
        Buffer.from(JSON.stringify(piiResult)),
      );

      await caller.call(
        'extract_pii',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        {
          expectedResult: {
            totalEntities: 3,
            entitiesByType: { EMAIL: 2, NAME: 1 },
            averageConfidence: 0.9,
            data: piiResult,
          },
        },
      );

      expect(platformHandlerMock.extractPiiBoundingBoxes).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'en',
      );
      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });

    it('writes detections to file when outputTarget is file', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPiiBoundingBoxes.mockResolvedValue(
        Buffer.from(JSON.stringify(piiResult)),
      );
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-pii.json'));

      await caller.call(
        'extract_pii',
        { inputPath: path.join(tmpDir, 'doc.pdf'), outputTarget: 'file' },
        {
          expectedResult: {
            outputFilename: 'doc-pii.json',
            totalEntities: 3,
            entitiesByType: { EMAIL: 2, NAME: 1 },
            averageConfidence: 0.9,
          },
        },
      );

      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'doc.pdf'),
        Buffer.from(JSON.stringify(piiResult)),
        { stemSuffix: 'pii', ext: 'json' },
      );
    });

    it('passes custom language', async () => {
      const piiResult = { PIIBoxes: [] };
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPiiBoundingBoxes.mockResolvedValue(
        Buffer.from(JSON.stringify(piiResult)),
      );
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-pii.json'));

      await caller.call('extract_pii', {
        inputPath: path.join(tmpDir, 'doc.pdf'),
        language: 'es',
      });

      expect(platformHandlerMock.extractPiiBoundingBoxes).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        'es',
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.extractPiiBoundingBoxes.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'extract_pii',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });

  describe('redact_pdf', () => {
    it('redacts using manual redactions', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.redactPdf.mockResolvedValue(Buffer.from('redacted-pdf'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-redacted.pdf'));

      const redactions = [{ pageIndex: 0, boundingBox: [10, 20, 30, 40] }];

      await caller.call(
        'redact_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf'), redactions },
        { expectedResult: { outputFilename: 'doc-redacted.pdf', redactionCount: 1 } },
      );

      expect(platformHandlerMock.redactPdf).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        redactions,
      );
    });

    it('redacts using piiJsonFile', async () => {
      const piiResult = {
        PIIBoxes: [
          { PIIType: 'EMAIL', confidence: 0.9, pageIndex: 0, boundingBox: [10, 20, 30, 40] },
          { PIIType: 'NAME', confidence: 0.8, pageIndex: 1, boundingBox: [5, 5, 15, 15] },
        ],
      };
      filesHandlerMock.read
        .mockReturnValueOnce(Buffer.from('pdf-bytes'))
        .mockReturnValueOnce(Buffer.from(JSON.stringify(piiResult)));
      platformHandlerMock.redactPdf.mockResolvedValue(Buffer.from('redacted-pdf'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-redacted.pdf'));

      await caller.call(
        'redact_pdf',
        {
          inputPath: path.join(tmpDir, 'doc.pdf'),
          piiJsonFile: path.join(tmpDir, 'doc-pii.json'),
        },
        { expectedResult: { outputFilename: 'doc-redacted.pdf', redactionCount: 2 } },
      );

      expect(platformHandlerMock.redactPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), [
        { pageIndex: 0, boundingBox: [10, 20, 30, 40] },
        { pageIndex: 1, boundingBox: [5, 5, 15, 15] },
      ]);
    });

    it('returns error when neither redactions nor piiJsonFile provided', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));

      await caller.call(
        'redact_pdf',
        { inputPath: path.join(tmpDir, 'doc.pdf') },
        { expectError: true },
      );

      expect(platformHandlerMock.redactPdf).not.toHaveBeenCalled();
    });

    it('returns error when piiJsonFile has no detections', async () => {
      const piiResult = { PIIBoxes: [] };
      filesHandlerMock.read
        .mockReturnValueOnce(Buffer.from('pdf-bytes'))
        .mockReturnValueOnce(Buffer.from(JSON.stringify(piiResult)));

      await caller.call(
        'redact_pdf',
        {
          inputPath: path.join(tmpDir, 'doc.pdf'),
          piiJsonFile: path.join(tmpDir, 'doc-pii.json'),
        },
        { expectError: true },
      );

      expect(platformHandlerMock.redactPdf).not.toHaveBeenCalled();
    });
  });
});
