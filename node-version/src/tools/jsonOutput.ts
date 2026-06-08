import path from 'node:path';
import type { FilesHandler } from '../handlers/filesHandler.js';
import type { OutputTarget } from '../models.js';

export interface JsonResultOptions {
  readonly outputTarget: OutputTarget;
  readonly data: unknown;
  readonly bytes: Buffer;
  readonly filesHandler: FilesHandler;
  readonly inputPath: string;
  readonly stemSuffix: string;
  readonly extra?: Record<string, unknown>;
}

export function jsonResult(options: JsonResultOptions): {
  structuredContent: Record<string, unknown>;
  content: [{ type: 'text'; text: string }];
} {
  const { outputTarget, data, bytes, filesHandler, inputPath, stemSuffix, extra } = options;

  const structured: Record<string, unknown> = { ...extra };

  if (outputTarget === 'inline' || outputTarget === 'both') {
    structured.data = data;
  }

  if (outputTarget === 'file' || outputTarget === 'both') {
    const outputPath = filesHandler.write(inputPath, bytes, { stemSuffix, ext: 'json' });
    structured.outputFilename = path.basename(outputPath);
  }

  return {
    structuredContent: structured,
    content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
  };
}
