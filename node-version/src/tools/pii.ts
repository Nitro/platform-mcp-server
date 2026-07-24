import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DESTRUCTIVE, READ_ONLY } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { outputTargetSchema, singleFileInputSchema } from '../models.js';
import { jsonResult } from './jsonOutput.js';

interface _PIIBox {
  PIIType: string;
  confidence: number;
  pageIndex: number;
  boundingBox: number[];
}

interface _PIIDetectionResult {
  PIIBoxes: _PIIBox[];
}

function _parsePiiResult(buffer: Buffer): _PIIDetectionResult {
  const parsed: unknown = JSON.parse(buffer.toString());
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('PIIBoxes' in parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).PIIBoxes)
  ) {
    throw new Error('Unexpected PII result shape');
  }
  return parsed as _PIIDetectionResult;
}

const _boundingBoxAreaSchema = z.object({
  pageIndex: z.number().int().min(0).describe('Page number (0-indexed)'),
  boundingBox: z
    .array(z.number())
    .length(4)
    .describe('Bounding box coordinates [x0, y0, width, height]'),
});

function _successResult(
  outputFilename: string,
  extra?: Record<string, unknown>,
): {
  structuredContent: Record<string, unknown>;
  content: [{ type: 'text'; text: string }];
} {
  const result = { outputFilename, ...extra };
  return {
    structuredContent: result,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  };
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'extract_pii',
    {
      description:
        'Use this tool to extract PII (Personally Identifiable Information) from a PDF file. ' +
        'Returns detected PII entities, bounding boxes, and confidence scores. By default ' +
        "(outputTarget 'inline') the detections are returned directly in the result; set " +
        "outputTarget to 'file' or 'both' to also write them to a JSON file on disk.",
      inputSchema: {
        ...singleFileInputSchema.shape,
        language: z
          .enum(['en', 'es'])
          .default('en')
          .describe('Language code for PII detection (en=English, es=Spanish)'),
        outputTarget: outputTargetSchema,
      },
      annotations: READ_ONLY('Extract PII'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const piiJson = await platformHandler.extractPiiBoundingBoxes(inputBytes, args.language);

        const piiResult = _parsePiiResult(piiJson);
        const totalEntities = piiResult.PIIBoxes.length;
        const entitiesByType: Record<string, number> = {};
        for (const box of piiResult.PIIBoxes) {
          entitiesByType[box.PIIType] = (entitiesByType[box.PIIType] ?? 0) + 1;
        }
        const averageConfidence =
          totalEntities > 0
            ? Math.round(
                (piiResult.PIIBoxes.reduce((sum, box) => sum + box.confidence, 0) / totalEntities) *
                  1000,
              ) / 1000
            : 0;

        return jsonResult({
          outputTarget: args.outputTarget,
          data: piiResult,
          bytes: piiJson,
          filesHandler,
          inputPath: args.inputPath,
          stemSuffix: 'pii',
          extra: { totalEntities, entitiesByType, averageConfidence },
        });
      } catch (err) {
        return handleToolError('extract_pii', err);
      }
    },
  );

  server.registerTool(
    'redact_pdf',
    {
      description:
        'Use this tool to redact a PDF file. You can either: ' +
        '(1) Provide a piiJsonFile path (output from extract_pii tool) to automatically ' +
        'redact all detected PII, OR ' +
        '(2) Provide manual redactions with page indices and bounding box coordinates. ' +
        'The tool will apply redactions and save a redacted PDF.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        redactions: z
          .array(_boundingBoxAreaSchema)
          .optional()
          .describe('List of areas to redact. Each area specifies a page and bounding box.'),
        piiJsonFile: z
          .string()
          .optional()
          .describe(
            'Full path to PII detection JSON file (from extract_pii with outputTarget ' +
              "'file' or 'both'). If provided, redactions will be extracted automatically " +
              'from this file. To redact only a subset of detected PII (e.g. just names ' +
              'and emails), omit this and pass the chosen bounding boxes via redactions instead.',
          ),
      },
      annotations: DESTRUCTIVE('Redact PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);

        let redactions: { pageIndex: number; boundingBox: number[] }[];

        if (args.piiJsonFile !== undefined) {
          const jsonBytes = filesHandler.read(args.piiJsonFile);
          const piiResult = _parsePiiResult(jsonBytes);
          if (piiResult.PIIBoxes.length === 0) {
            throw new UserFacingError('No PII detections found in JSON file');
          }
          redactions = piiResult.PIIBoxes.map((box) => ({
            pageIndex: box.pageIndex,
            boundingBox: box.boundingBox,
          }));
        } else if (args.redactions !== undefined && args.redactions.length > 0) {
          redactions = args.redactions;
        } else {
          throw new UserFacingError('Either redactions or piiJsonFile must be provided');
        }

        const redactedBytes = await platformHandler.redactPdf(inputBytes, redactions);

        const outputPath = filesHandler.write(args.inputPath, redactedBytes, {
          stemSuffix: 'redacted',
        });

        return _successResult(path.basename(outputPath), {
          redactionCount: redactions.length,
        });
      } catch (err) {
        return handleToolError('redact_pdf', err);
      }
    },
  );
}
