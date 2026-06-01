import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NON_DESTRUCTIVE } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { FileFormat, isFileFormat } from '../client/enums.js';
import { handleToolError, UserFacingError } from '../errors.js';
import {
  ConversionNotSupportedError,
  type PdfAParams,
  SupportedConversions,
} from '../handlers/platformHandler.js';

const conversionRequestSchema = {
  inputPath: z
    .string()
    .describe(
      "Full path to the source file (e.g., '~/Downloads/file.pdf' or '/home/user/Documents/file.pdf'). Must include the directory — bare filenames are not accepted.",
    ),
  to: z
    .string()
    .describe(
      'Format to convert the file to. Use "pdfa" to convert a PDF to PDF/A archival format; also provide conformance in that case.',
    ),
  conformance: z
    .enum(['1b', '1a', '2b', '2u', '2a', '3b', '3u', '3a'])
    .optional()
    .describe(
      'PDF/A conformance level. Required when to is "pdfa". ' +
        'Levels ending in "a" (accessible) require the source PDF to be tagged. ' +
        'Use "b" or "u" variants for general-purpose archiving (e.g., "2b").',
    ),
  imageQuality: z
    .number()
    .min(0.01)
    .max(1.0)
    .optional()
    .describe(
      'Image compression quality for PDF/A conversion (0.01 = maximum compression, 1.0 = maximum quality, default 0.8).',
    ),
  copyMetadata: z
    .boolean()
    .optional()
    .describe(
      'Preserve document metadata (author, creation date, etc.) in the PDF/A output (default true).',
    ),
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
      annotations: NON_DESTRUCTIVE('Convert File'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const ext = path.extname(args.inputPath).replace(/^\./, '').toLowerCase();
        if (!ext) {
          throw new UserFacingError(
            `inputPath must include a filename with a supported extension.`,
          );
        }
        if (!isFileFormat(ext)) {
          throw new UserFacingError(`Unrecognized input file format: ${ext}`);
        }
        const inputFormat = ext;

        if (!isFileFormat(args.to)) {
          throw new UserFacingError(`Unrecognized target format: ${args.to}`);
        }
        const outputFormat = args.to;

        let pdfaParams: PdfAParams | undefined;
        if (outputFormat === FileFormat.PDFA) {
          if (!args.conformance) {
            throw new UserFacingError('conformance is required when converting to pdfa');
          }
          pdfaParams = {
            conformance: args.conformance,
            ...(args.imageQuality !== undefined && { imageQuality: args.imageQuality }),
            ...(args.copyMetadata !== undefined && { copyMetadata: args.copyMetadata }),
          };
        }

        const inputBytes = filesHandler.read(args.inputPath);
        const convertedBytes = pdfaParams
          ? await platformHandler.convertFile(inputBytes, inputFormat, outputFormat, pdfaParams)
          : await platformHandler.convertFile(inputBytes, inputFormat, outputFormat);

        const isPdfToImage = inputFormat === FileFormat.PDF && _PDF_IMAGE_FORMATS.has(outputFormat);
        const isPdfToPdfa = outputFormat === FileFormat.PDFA;
        const outputExt = isPdfToImage ? 'zip' : isPdfToPdfa ? 'pdf' : args.to;
        const stemSuffix = isPdfToPdfa ? 'pdfa' : 'converted';

        const outputPath = filesHandler.write(args.inputPath, convertedBytes, {
          stemSuffix,
          ext: outputExt,
        });

        const result = { outputFilename: path.basename(outputPath) };
        return {
          structuredContent: result,
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        return handleToolError('convert_file', err, [ConversionNotSupportedError]);
      }
    },
  );
}
