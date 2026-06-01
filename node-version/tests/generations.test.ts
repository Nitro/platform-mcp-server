import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenericFailedError } from '../src/errors.js';
import type { FilesHandler } from '../src/handlers/filesHandler.js';
import type { PlatformHandler } from '../src/handlers/platformHandler.js';
import { register } from '../src/tools/generations.js';
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

describe('generation tools', () => {
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
      compressPdf: vi.fn(),
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

  describe('fill_forms', () => {
    it('fills form fields and returns output filename', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call(
        'fill_forms',
        {
          inputPath: path.join(tmpDir, 'form.pdf'),
          fields: { 'first-name': 'first-name-value', 'last-name': 'last-name-value' },
        },
        { expectedResult: { outputFilename: 'form-filled.pdf' } },
      );

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        { 'first-name': 'first-name-value', 'last-name': 'last-name-value' },
        {},
      );
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'form.pdf'),
        Buffer.from('filled-bytes'),
        { stemSuffix: 'filled', ext: 'pdf' },
      );
    });

    it('passes strict param when provided', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call('fill_forms', {
        inputPath: path.join(tmpDir, 'form.pdf'),
        fields: { 'field-name': 'field-value' },
        strict: true,
      });

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        { 'field-name': 'field-value' },
        { strict: true },
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.fillForms.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'fill_forms',
        { inputPath: path.join(tmpDir, 'form.pdf'), fields: { 'field-name': 'field-value' } },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });
});
