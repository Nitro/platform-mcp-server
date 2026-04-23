import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from '../src/tools/fileManagement.js';
import { createAppContext, type MockFilesHandler } from './helpers/fixtures.js';
import { ToolCaller } from './helpers/toolCaller.js';
import type { FilesHandler } from '../src/handlers/filesHandler.js';
import type { FileEntry } from '../src/handlers/filesHandler.js';

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

describe('list_files tool', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-mgmt-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    vi.restoreAllMocks();
  });

  it('returns files from handler sorted by mtime descending', async () => {
    const filesHandlerMock: MockFilesHandler = {
      read: vi.fn(),
      write: vi.fn(),
      listFiles: vi.fn(),
    };
    const now = Date.now();
    const entries: FileEntry[] = [
      { filePath: path.join(tmpDir, 'a.pdf'), mtimeMs: now - 1000, sizeBytes: 100 },
      { filePath: path.join(tmpDir, 'b.pdf'), mtimeMs: now, sizeBytes: 200 },
    ];
    filesHandlerMock.listFiles.mockReturnValue(entries);

    const context = createAppContext({ filesHandler: filesHandlerMock as unknown as FilesHandler });
    const { caller, cleanup } = await _createToolCaller(context);

    try {
      const result = await caller.call('list_files', { folder: tmpDir });
      const structured = result.structuredContent as {
        files: { path: string }[];
        totalCount: number;
      };
      expect(structured.totalCount).toBe(2);
      expect(structured.files.at(0)?.path).toBe(path.join(tmpDir, 'b.pdf'));
      expect(structured.files.at(1)?.path).toBe(path.join(tmpDir, 'a.pdf'));
    } finally {
      await cleanup();
    }
  });

  it('passes fileType filter to handler', async () => {
    const filesHandlerMock: MockFilesHandler = {
      read: vi.fn(),
      write: vi.fn(),
      listFiles: vi.fn(),
    };
    filesHandlerMock.listFiles.mockReturnValue([]);

    const context = createAppContext({ filesHandler: filesHandlerMock as unknown as FilesHandler });
    const { caller, cleanup } = await _createToolCaller(context);

    try {
      await caller.call('list_files', { folder: tmpDir, fileType: 'pdf' });
      expect(filesHandlerMock.listFiles).toHaveBeenCalledWith(expect.any(String), 'pdf');
    } finally {
      await cleanup();
    }
  });

  it('returns error when handler throws', async () => {
    const filesHandlerMock: MockFilesHandler = {
      read: vi.fn(),
      write: vi.fn(),
      listFiles: vi.fn(),
    };
    filesHandlerMock.listFiles.mockImplementation(() => {
      throw new Error('Folder does not exist');
    });

    const context = createAppContext({ filesHandler: filesHandlerMock as unknown as FilesHandler });
    const { caller, cleanup } = await _createToolCaller(context);

    try {
      await caller.call('list_files', { folder: '/nonexistent' }, { expectError: true });
    } finally {
      await cleanup();
    }
  });
});
