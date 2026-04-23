import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { FileFormat, isFileFormat } from '../client/enums.js';
import { GenericFailedError, UserFacingError } from '../errors.js';
import { logger } from '../logger.js';
import { ConversionNotSupportedError, SupportedConversions } from '../handlers/platformHandler.js';

const conversionRequestSchema = {
  inputPath: z.string().describe(
    "Full path to the source file (e.g., '~/Downloads/file.pdf' or '/home/user/Documents/file.pdf'). Must include the directory — bare filenames are not accepted.",
  ),
  to: z.string().describe('Format to convert the file to'),
};

const _PDF_IMAGE_FORMATS = new Set<FileFormat>([FileFormat.JPEG, FileFormat.PNG]);

export function register(server: McpServer, context: AppContext): void {
  const fromPdfTo = [...SupportedConversions.fromPdfTo].sort().join(', ');
  const toPdfFrom = [...SupportedConversions.toPdfFrom].sort().join(', ');
  const description =
    'Use this tool when the user asks to convert a file.\n' +
    'The following conversions are supported:\n' +
    `Convert from a pdf to ${fromPdfTo}.\n` +
    `Convert from a ${toPdfFrom} to pdf.\n` +
    'Use list_files first if you need to discover available files.';

  server.registerTool(
    'convert_file',
    {
      description,
      inputSchema: conversionRequestSchema,
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        if (!path.isAbsolute(args.inputPath) && !args.inputPath.startsWith('~')) {
          throw new UserFacingError(
            `inputPath must be an absolute path or start with ~. Use list_files to find the full path.`,
          );
        }

        const ext = path.extname(args.inputPath).replace(/^\./, '').toLowerCase();
        if (!isFileFormat(ext)) {
          throw new UserFacingError(`Unrecognized input file format: ${ext}`);
        }
        const inputFormat = ext;

        if (!isFileFormat(args.to)) {
          throw new UserFacingError(`Unrecognized target format: ${args.to}`);
        }
        const outputFormat = args.to;

        const inputBytes = filesHandler.read(args.inputPath);
        const convertedBytes = await platformHandler.convertFile(inputBytes, inputFormat, outputFormat);

        const isPdfToImage =
          inputFormat === FileFormat.PDF && _PDF_IMAGE_FORMATS.has(outputFormat);
        const outputExt = isPdfToImage ? 'zip' : args.to;

        const outputPath = filesHandler.write(args.inputPath, convertedBytes, {
          stemSuffix: 'converted',
          ext: outputExt,
        });

        const result = { outputFilename: path.basename(outputPath) };
        return {
          structuredContent: result,
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const isUserFacingError =
          err instanceof UserFacingError ||
          err instanceof ConversionNotSupportedError ||
          err instanceof GenericFailedError;
        if (!isUserFacingError) {
          const loggedError = err instanceof Error ? (err.stack ?? err.message) : String(err);
          logger.error(`[convert_file] Unexpected error: ${loggedError}`);
        }
        const message =
          isUserFacingError && err instanceof Error
            ? err.message
            : new GenericFailedError().message;
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    },
  );
}
