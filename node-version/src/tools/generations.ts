import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NON_DESTRUCTIVE } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError } from '../errors.js';
import { singleFileInputSchema } from '../models.js';
import type { FillFormsParams } from '../handlers/platformHandler.js';

function _successResult(
  outputFilename: string,
  extra?: Record<string, unknown>,
): { structuredContent: Record<string, unknown>; content: [{ type: 'text'; text: string }] } {
  const result = { outputFilename, ...extra };
  return {
    structuredContent: result,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  };
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'fill_forms',
    {
      description:
        'Use this tool to fill in form fields in a PDF document with the provided field values.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        fields: z
          .record(z.string())
          .describe(
            'Map of form field names to their values. ' +
              'Example: {"FirstName": "Jane", "LastName": "Doe", "Email": "jane@example.com"}',
          ),
        strict: z
          .boolean()
          .optional()
          .describe(
            'When true, the request fails if the input contains unknown field names or omits required fields. ' +
              'When false (default), unrecognized fields are silently ignored and only matching fields are filled.',
          ),
      },
      annotations: NON_DESTRUCTIVE('Fill PDF Form'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const params: FillFormsParams = {
          ...(args.strict !== undefined && { strict: args.strict }),
        };

        const inputBytes = filesHandler.read(args.inputPath);
        const filledBytes = await platformHandler.fillForms(inputBytes, args.fields, params);

        const outputPath = filesHandler.write(args.inputPath, filledBytes, {
          stemSuffix: 'filled',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('fill_forms', err);
      }
    },
  );
}
