import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandUser } from '../utils.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';

const listFilesRequestSchema = {
  folder: z
    .string()
    .min(1)
    .describe(
      "Full path to the folder to list files from (e.g., '~/Downloads' or '/home/user/Documents'). " +
        "You may also provide a bare folder name like 'Downloads' and it will be resolved from the home directory. " +
        'If you are unsure of the full path, ask the user to provide it.',
    ),
  fileType: z
    .enum(['pdf'])
    .nullable()
    .optional()
    .describe("Type of files to list ('pdf' or omit for all files)"),
};

function _searchFolderInHome(name: string): string | null {
  const home = os.homedir();
  try {
    const entries = fs.readdirSync(home, { withFileTypes: true });
    const nameLower = name.toLowerCase();
    for (const entry of entries) {
      if (entry.name.toLowerCase() === nameLower) {
        const entryPath = path.join(home, entry.name);
        if (fs.statSync(entryPath).isDirectory()) {
          return entryPath;
        }
      }
    }
  } catch {
    // Ignore errors and fall back to normal path resolution below.
  }
  return null;
}

function _resolveFolder(folder: string): string {
  if (folder === '~' || folder.startsWith('~/') || folder.startsWith('~\\')) {
    return path.resolve(expandUser(folder));
  }
  if (path.isAbsolute(folder)) {
    return folder;
  }
  const home = os.homedir();
  const parts = path.normalize(folder).split(path.sep);
  const firstPart = parts[0];
  let resolved: string;
  if (firstPart !== undefined) {
    const found = _searchFolderInHome(firstPart);
    resolved =
      found !== null
        ? path.resolve(path.join(found, ...parts.slice(1)))
        : path.resolve(home, folder);
  } else {
    resolved = path.resolve(home, folder);
  }
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    throw new UserFacingError(`Folder path must be within the home directory.`);
  }
  return resolved;
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'list_files',
    {
      description:
        "List files on the user's local filesystem available for PDF processing." +
        ' Use this tool whenever the user asks about files they have locally,' +
        ' wants to find PDFs, or before any other Nitro MCP operation that requires a file.',
      inputSchema: listFilesRequestSchema,
      annotations: { readOnlyHint: true },
    },
    (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const resolvedFolder = _resolveFolder(args.folder);
        const entries = filesHandler.listFiles(resolvedFolder, args.fileType ?? undefined);

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
