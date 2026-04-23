import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandUser } from '../utils.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';

const listFilesRequestSchema = {
  folder: z.string().describe(
    "Full path to the folder to list files from (e.g., '~/Downloads' or '/home/user/Documents'). " +
      "You may also provide a bare folder name like 'Downloads' and it will be resolved from the home directory. " +
      'If you are unsure of the full path, ask the user to provide it.',
  ),
  fileType: z.enum(['pdf']).optional().describe("Type of files to list ('pdf' or omit for all files)"),
};

function _searchFolderInHome(name: string): string | null {
  const home = os.homedir();
  try {
    const entries = fs.readdirSync(home, { withFileTypes: true });
    const nameLower = name.toLowerCase();
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.toLowerCase() === nameLower) {
        return path.join(home, entry.name);
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
  const parts = path.normalize(folder).split(path.sep);
  const firstPart = parts[0];
  if (firstPart !== undefined) {
    const found = _searchFolderInHome(firstPart);
    if (found !== null) {
      return path.resolve(path.join(found, ...parts.slice(1)));
    }
  }
  return path.resolve(folder);
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'list_files',
    {
      description: 'List files on the user\'s local filesystem available for PDF processing.' +
        ' Use this tool whenever the user asks about files they have locally,' +
        ' wants to find PDFs, or before any other Nitro MCP operation that requires a file.',
      inputSchema: listFilesRequestSchema,
      annotations: { readOnlyHint: true },
    },
    (args) => {
      const filesHandler = getDep(context, 'filesHandler');
      const resolvedFolder = _resolveFolder(args.folder);
      const entries = filesHandler.listFiles(resolvedFolder, args.fileType);

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
    },
  );
}
