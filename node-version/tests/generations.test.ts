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
      smartDetectFormFields: vi.fn(),
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
      fillForms: vi.fn(),
      createFillableForms: vi.fn(),
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
    it('serializes fields to JSON bytes and returns output filename', async () => {
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
        Buffer.from(
          JSON.stringify({ 'first-name': 'first-name-value', 'last-name': 'last-name-value' }),
        ),
        'json',
        {},
      );
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'form.pdf'),
        Buffer.from('filled-bytes'),
        { stemSuffix: 'filled', ext: 'pdf' },
      );
    });

    it('serializes field values containing commas via JSON', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call('fill_forms', {
        inputPath: path.join(tmpDir, 'form.pdf'),
        fields: { Name: 'value,with,commas' },
      });

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from(JSON.stringify({ Name: 'value,with,commas' })),
        'json',
        {},
      );
    });

    it('serializes non-string field values (numbers and booleans) via JSON', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call('fill_forms', {
        inputPath: path.join(tmpDir, 'form.pdf'),
        fields: { Age: 30, AgreeToTerms: true },
      });

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from(JSON.stringify({ Age: 30, AgreeToTerms: true })),
        'json',
        {},
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
        Buffer.from(JSON.stringify({ 'field-name': 'field-value' })),
        'json',
        { strict: true },
      );
    });

    it('passes raw CSV bytes through when csvPath is provided', async () => {
      const csvContent = 'first-name,first-name-value\nlast-name,last-name-value\n';
      filesHandlerMock.read.mockImplementation((filePath: string) => {
        if (filePath === path.join(tmpDir, 'fields.csv')) return Buffer.from(csvContent);
        return Buffer.from('pdf-bytes');
      });
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call(
        'fill_forms',
        {
          inputPath: path.join(tmpDir, 'form.pdf'),
          csvPath: path.join(tmpDir, 'fields.csv'),
        },
        { expectedResult: { outputFilename: 'form-filled.pdf' } },
      );

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from(csvContent),
        'csv',
        {},
      );
    });

    it('passes raw JSON bytes through when jsonPath is provided', async () => {
      const jsonContent = JSON.stringify({ 'first-name': 'first-name-value' });
      filesHandlerMock.read.mockImplementation((filePath: string) => {
        if (filePath === path.join(tmpDir, 'fields.json')) return Buffer.from(jsonContent);
        return Buffer.from('pdf-bytes');
      });
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call(
        'fill_forms',
        {
          inputPath: path.join(tmpDir, 'form.pdf'),
          jsonPath: path.join(tmpDir, 'fields.json'),
        },
        { expectedResult: { outputFilename: 'form-filled.pdf' } },
      );

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from(jsonContent),
        'json',
        {},
      );
    });

    it('passes raw XFDF bytes through when xfdfPath is provided', async () => {
      const xfdfContent = '<?xml version="1.0"?><xfdf xmlns="http://ns.adobe.com/xfdf/"></xfdf>';
      filesHandlerMock.read.mockImplementation((filePath: string) => {
        if (filePath === path.join(tmpDir, 'fields.xfdf')) return Buffer.from(xfdfContent);
        return Buffer.from('pdf-bytes');
      });
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call(
        'fill_forms',
        {
          inputPath: path.join(tmpDir, 'form.pdf'),
          xfdfPath: path.join(tmpDir, 'fields.xfdf'),
        },
        { expectedResult: { outputFilename: 'form-filled.pdf' } },
      );

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from(xfdfContent),
        'xfdf',
        {},
      );
    });

    it('passes raw FDF bytes through when fdfPath is provided', async () => {
      const fdfContent = '%FDF-1.2\n1 0 obj\n<< /FDF << /Fields [] >> >>\nendobj\n%%EOF\n';
      filesHandlerMock.read.mockImplementation((filePath: string) => {
        if (filePath === path.join(tmpDir, 'fields.fdf')) return Buffer.from(fdfContent);
        return Buffer.from('pdf-bytes');
      });
      platformHandlerMock.fillForms.mockResolvedValue(Buffer.from('filled-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-filled.pdf'));

      await caller.call(
        'fill_forms',
        {
          inputPath: path.join(tmpDir, 'form.pdf'),
          fdfPath: path.join(tmpDir, 'fields.fdf'),
        },
        { expectedResult: { outputFilename: 'form-filled.pdf' } },
      );

      expect(platformHandlerMock.fillForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
        Buffer.from(fdfContent),
        'fdf',
        {},
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

    it('returns error when neither fields nor csvPath is provided', async () => {
      await caller.call(
        'fill_forms',
        { inputPath: path.join(tmpDir, 'form.pdf') },
        { expectError: true },
      );

      expect(platformHandlerMock.fillForms).not.toHaveBeenCalled();
    });

    it('returns error when both fields and csvPath are provided', async () => {
      await caller.call(
        'fill_forms',
        {
          inputPath: path.join(tmpDir, 'form.pdf'),
          fields: { 'field-name': 'field-value' },
          csvPath: path.join(tmpDir, 'fields.csv'),
        },
        { expectError: true },
      );

      expect(platformHandlerMock.fillForms).not.toHaveBeenCalled();
    });
  });

  describe('create_fillable_forms', () => {
    it('generates a fillable PDF and returns the output filename', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.createFillableForms.mockResolvedValue(Buffer.from('fillable-bytes'));
      filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'form-fillable.pdf'));

      await caller.call(
        'create_fillable_forms',
        { inputPath: path.join(tmpDir, 'form.pdf') },
        { expectedResult: { outputFilename: 'form-fillable.pdf' } },
      );

      expect(platformHandlerMock.createFillableForms).toHaveBeenCalledWith(
        Buffer.from('pdf-bytes'),
      );
      expect(filesHandlerMock.write).toHaveBeenCalledWith(
        path.join(tmpDir, 'form.pdf'),
        Buffer.from('fillable-bytes'),
        { stemSuffix: 'fillable', ext: 'pdf' },
      );
    });

    it('returns error when platform handler throws', async () => {
      filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
      platformHandlerMock.createFillableForms.mockRejectedValue(new GenericFailedError());

      await caller.call(
        'create_fillable_forms',
        { inputPath: path.join(tmpDir, 'form.pdf') },
        { expectError: true },
      );

      expect(filesHandlerMock.write).not.toHaveBeenCalled();
    });
  });
});
