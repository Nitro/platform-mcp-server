import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../src/tools/conversions.js';
import { GenericFailedError, UserFacingError } from '../src/errors.js';
import { createAppContext, type MockFilesHandler, type MockPlatformHandler } from './helpers/fixtures.js';
import { ToolCaller } from './helpers/toolCaller.js';
import type { FilesHandler } from '../src/handlers/filesHandler.js';
import type { PlatformHandler } from '../src/handlers/platformHandler.js';

async function _createToolCaller(
  context: ReturnType<typeof createAppContext>
): Promise<{
  caller: ToolCaller;
  cleanup: () => Promise<void>;
}> {
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

describe('convert_file tool', () => {
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

  it('converts pdf to docx and returns result filename', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-content'));
    platformHandlerMock.convertFile.mockResolvedValue(Buffer.from('converted-content'));
    filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'a-converted.docx'));

    await caller.call(
      'convert_file',
      { inputPath: path.join(tmpDir, 'a.pdf'), to: 'docx' },
      { expectedResult: { outputFilename: 'a-converted.docx' } },
    );

    expect(filesHandlerMock.read).toHaveBeenCalledWith(path.join(tmpDir, 'a.pdf'));
    expect(platformHandlerMock.convertFile).toHaveBeenCalledWith(
      Buffer.from('pdf-content'),
      'pdf',
      'docx',
    );
    expect(filesHandlerMock.write).toHaveBeenCalledWith(
      path.join(tmpDir, 'a.pdf'),
      Buffer.from('converted-content'),
      { stemSuffix: 'converted', ext: 'docx' },
    );
  });

  it('converts docx to pdf', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('docx-content'));
    platformHandlerMock.convertFile.mockResolvedValue(Buffer.from('pdf-output'));
    filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-converted.pdf'));

    await caller.call(
      'convert_file',
      { inputPath: path.join(tmpDir, 'doc.docx'), to: 'pdf' },
      { expectedResult: { outputFilename: 'doc-converted.pdf' } },
    );

    expect(filesHandlerMock.write).toHaveBeenCalledWith(
      path.join(tmpDir, 'doc.docx'),
      Buffer.from('pdf-output'),
      { stemSuffix: 'converted', ext: 'pdf' },
    );
  });

  it('returns error for invalid target format', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-content'));

    await caller.call(
      'convert_file',
      { inputPath: path.join(tmpDir, 'a.pdf'), to: 'invalid-format' },
      { expectError: true },
    );

    expect(platformHandlerMock.convertFile).not.toHaveBeenCalled();
  });

  it('returns error when file is missing', async () => {
    filesHandlerMock.read.mockImplementation(() => {
      throw new UserFacingError('File does not exist');
    });

    await caller.call(
      'convert_file',
      { inputPath: path.join(tmpDir, 'missing.pdf'), to: 'docx' },
      { expectError: true },
    );

    expect(platformHandlerMock.convertFile).not.toHaveBeenCalled();
  });

  it('returns error when platform handler throws', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-content'));
    platformHandlerMock.convertFile.mockRejectedValue(new GenericFailedError());

    await caller.call(
      'convert_file',
      { inputPath: path.join(tmpDir, 'a.pdf'), to: 'docx' },
      { expectError: true },
    );

    expect(filesHandlerMock.write).not.toHaveBeenCalled();
  });

  it('uses zip extension for pdf to jpeg conversion', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-content'));
    platformHandlerMock.convertFile.mockResolvedValue(Buffer.from('zip-with-images'));
    filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'a-converted.zip'));

    await caller.call(
      'convert_file',
      { inputPath: path.join(tmpDir, 'a.pdf'), to: 'jpeg' },
      { expectedResult: { outputFilename: 'a-converted.zip' } },
    );

    expect(filesHandlerMock.write).toHaveBeenCalledWith(
      path.join(tmpDir, 'a.pdf'),
      Buffer.from('zip-with-images'),
      { stemSuffix: 'converted', ext: 'zip' },
    );
  });

  it('uses zip extension for pdf to png conversion', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-content'));
    platformHandlerMock.convertFile.mockResolvedValue(Buffer.from('zip-with-images'));
    filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'doc-converted.zip'));

    await caller.call(
      'convert_file',
      { inputPath: path.join(tmpDir, 'doc.pdf'), to: 'png' },
      { expectedResult: { outputFilename: 'doc-converted.zip' } },
    );

    expect(filesHandlerMock.write).toHaveBeenCalledWith(
      path.join(tmpDir, 'doc.pdf'),
      Buffer.from('zip-with-images'),
      { stemSuffix: 'converted', ext: 'zip' },
    );
  });

  it('writes output via files handler', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-content'));
    platformHandlerMock.convertFile.mockResolvedValue(Buffer.from('output-bytes'));
    filesHandlerMock.write.mockReturnValue(path.join(tmpDir, 'a-converted.docx'));

    await caller.call('convert_file', { inputPath: path.join(tmpDir, 'a.pdf'), to: 'docx' });

    expect(filesHandlerMock.write).toHaveBeenCalledWith(
      path.join(tmpDir, 'a.pdf'),
      Buffer.from('output-bytes'),
      { stemSuffix: 'converted', ext: 'docx' },
    );
  });
});
