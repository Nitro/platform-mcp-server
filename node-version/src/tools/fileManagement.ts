import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { READ_ONLY } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError } from '../errors.js';

const listFilesRequestSchema = {
  folder: z
    .string()
    .min(1)
    .describe(
      "Full path to the folder to list files from (e.g., '~/Downloads' or '/home/user/Documents'). " +
        "You may also provide a bare folder name like 'Downloads' and it will be resolved from the allowed base directory. " +
        'If you are unsure of the full path, ask the user to provide it.',
    ),
  fileType: z
    .enum(['pdf'])
    .nullable()
    .optional()
    .describe("Type of files to list ('pdf' or omit for all files)"),
};

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'list_files',
    {
      description:
        'Lists files on the local filesystem available for PDF processing, ' +
        'optionally filtered by file type.',
      inputSchema: listFilesRequestSchema,
      annotations: READ_ONLY('List Files', { idempotent: true }),
    },
    (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const entries = filesHandler.listFiles(args.folder, args.fileType ?? undefined);

        const sorted = [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs);

        const files = sorted.map((entry) => ({
          path: entry.filePath,
          fileType: path.extname(entry.filePath).replace(/^\./, '') || 'unknown',
          sizeBytes: entry.sizeBytes,
          modifiedTime: new Date(entry.mtimeMs).toISOString(),
        }));

        const result = {
          files,
          totalCount: files.length,
          requestedFileType: args.fileType ?? null,
        };

        return {
          structuredContent: result,
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        return handleToolError('list_files', err);
      }
    },
  );
}
