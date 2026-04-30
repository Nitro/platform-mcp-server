import { z } from 'zod';

import { ContentType } from './enums.js';
import { checkHttpResponse, GenericFailedError } from '../errors.js';
import { logger } from '../logger.js';
import { settings } from '../config.js';

const _progressUpdateEventSchema = z.object({
  jobID: z.string(),
  status: z.literal('running'),
  progress: z.number(),
});

const _redirectEventSchema = z.object({
  jobID: z.string(),
  status: z.literal('completed'),
  location: z.string(),
});

const _failedEventSchema = z.object({
  jobID: z.string(),
  status: z.literal('failed'),
  location: z.string(),
});

const _sseEventSchema = z.discriminatedUnion('status', [
  _progressUpdateEventSchema,
  _redirectEventSchema,
  _failedEventSchema,
]);

type SseEvent = z.infer<typeof _sseEventSchema>;

export interface UrlFile {
  readonly kind: 'url';
  readonly contentType: ContentType;
  readonly url: string;
  readonly name: string;
}

export interface BytesFile {
  readonly kind: 'bytes';
  readonly contentType: ContentType;
  readonly content: Buffer;
  readonly name: string;
}

export type File = UrlFile | BytesFile;

export function createUrlFile(contentType: ContentType, url: string, name = 'file'): UrlFile {
  return { kind: 'url', contentType, url, name };
}

export function createBytesFile(
  contentType: ContentType,
  content: Buffer,
  name = 'file',
): BytesFile {
  return { kind: 'bytes', contentType, content, name };
}

function _fileToFormData(file: File, fieldName: string, form: FormData): void {
  if (file.kind === 'url') {
    const json = JSON.stringify({ URL: file.url, contentType: file.contentType });
    form.append(
      fieldName,
      new Blob([json], { type: 'application/vnd.gonitro.url+json' }),
      file.name,
    );
  } else {
    form.append(
      fieldName,
      new Blob([new Uint8Array(file.content)], { type: file.contentType }),
      file.name,
    );
  }
}

export type ApiPath = 'conversions' | 'extractions' | 'transformations';

export interface RunOptions {
  readonly method: string | null;
  readonly params?: Record<string, unknown>;
  readonly acceptFormat?: 'bytes' | 'json';
}

function _validateRunOptions(path: ApiPath, options: RunOptions): void {
  if (options.method === null && path !== 'conversions') {
    throw new Error(`method is required for path '${path}'`);
  }
}

export type TokenProvider = () => Promise<string>;

export class PlatformApiClient {
  private readonly _baseUrl: string;
  private readonly _tokenProvider: TokenProvider;
  private readonly _defaultTimeout = 30_000;
  private readonly _jobWaitTimeout = 120_000;

  static fromStaticToken(baseUrl: string, token: string): PlatformApiClient {
    return new PlatformApiClient(baseUrl, () => Promise.resolve(token));
  }

  static fromTokenProvider(baseUrl: string, provider: TokenProvider): PlatformApiClient {
    return new PlatformApiClient(baseUrl, provider);
  }

  constructor(baseUrl: string, tokenProvider: TokenProvider) {
    this._baseUrl = baseUrl;
    this._tokenProvider = tokenProvider;
  }

  private async _requestHeaders(sessionId: string): Promise<Record<string, string>> {
    const token = await this._tokenProvider();
    return {
      Authorization: `Bearer ${token}`,
      'X-Nitro-Client': `mcp/${settings.version}`,
      'X-Analytics-Session-Id': sessionId,
    };
  }

  private async *_iterSseEvents(statusUrl: string, sessionId: string): AsyncGenerator<SseEvent> {
    const res = await fetch(statusUrl, {
      headers: { ...(await this._requestHeaders(sessionId)), Accept: 'text/event-stream' },
      signal: AbortSignal.timeout(this._jobWaitTimeout),
    });
    await checkHttpResponse(res, sessionId);

    if (res.body === null) {
      throw new GenericFailedError(sessionId);
    }

    const reader = res.body.getReader();

    const _dispatch = (lines: string[]): SseEvent | null => {
      const data = lines.join('\n').trim();
      if (!data) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new Error(`Failed to parse SSE event as JSON: ${data.slice(0, 200)}`);
      }
      return _sseEventSchema.parse(parsed);
    };

    try {
      const decoder = new TextDecoder();
      let textBuffer = '';
      let dataLines: string[] = [];

      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        textBuffer += decoder.decode(chunk.value, { stream: !done });

        const rawLines = textBuffer.split('\n');
        textBuffer = !done && rawLines.length > 0 ? (rawLines.pop() ?? '') : '';

        for (const rawLine of rawLines) {
          const line = rawLine.replace(/\r$/, '');
          if (line === '') {
            const event = _dispatch(dataLines);
            dataLines = [];
            if (event !== null) yield event;
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (done && dataLines.length > 0) {
          const event = _dispatch(dataLines);
          if (event !== null) yield event;
        }
      }
    } finally {
      try {
        await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    }
  }

  private async _waitForJob(
    statusUrl: string,
    sessionId: string,
  ): Promise<{ failed: boolean; resultUrl: string }> {
    for await (const event of this._iterSseEvents(statusUrl, sessionId)) {
      if (event.status === 'running') {
        continue;
      }
      return { failed: event.status === 'failed', resultUrl: event.location };
    }
    throw new Error(`SSE stream closed before job finished at ${statusUrl}`);
  }

  async run(
    path: ApiPath,
    fileOrFiles: File | File[],
    options: RunOptions,
  ): Promise<{ body: Buffer; contentType: string }> {
    const sessionId = crypto.randomUUID();
    const form = new FormData();

    _validateRunOptions(path, options);

    logger.info(
      `[PlatformApiClient] Running \`${options.method ?? path}\` with session ID: ${sessionId}`,
    );

    if (options.method !== null) {
      form.append('method', options.method);
    }

    if (options.params !== undefined) {
      form.append('params', JSON.stringify(options.params));
    }

    if (!Array.isArray(fileOrFiles)) {
      _fileToFormData(fileOrFiles, 'file', form);
    } else {
      for (const file of fileOrFiles) {
        _fileToFormData(file, 'files', form);
      }
    }

    const triggerUrl = `${this._baseUrl}/${path}`;
    const submitRes = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        ...(await this._requestHeaders(sessionId)),
        Prefer: 'respond-async',
      },
      body: form,
      signal: AbortSignal.timeout(this._defaultTimeout),
    });

    await checkHttpResponse(submitRes, sessionId);

    if (submitRes.status !== 202) {
      logger.error(
        `[PlatformApiClient] Job submission returned unexpected status ${String(submitRes.status)} for ${triggerUrl}; expected 202`,
      );
      throw new GenericFailedError(sessionId);
    }

    const statusUrl = submitRes.headers.get('Location');
    if (statusUrl === null) {
      logger.error(
        `[PlatformApiClient] Job submission returned 202 without a Location header for ${triggerUrl}`,
      );
      throw new GenericFailedError(sessionId);
    }

    const { failed, resultUrl } = await this._waitForJob(statusUrl, sessionId);

    if (failed) {
      const errRes = await fetch(resultUrl, {
        headers: await this._requestHeaders(sessionId),
        signal: AbortSignal.timeout(this._defaultTimeout),
      });
      await checkHttpResponse(errRes, sessionId);
      const rawErrBody = await errRes.text();
      let loggedError = rawErrBody;
      try {
        const parsedErrBody: unknown = JSON.parse(rawErrBody);
        if (typeof parsedErrBody === 'object' && parsedErrBody !== null) {
          const errorField = 'error' in parsedErrBody ? parsedErrBody.error : undefined;
          const messageField = 'message' in parsedErrBody ? parsedErrBody.message : undefined;
          if (typeof errorField === 'string') {
            loggedError = errorField;
          } else if (typeof messageField === 'string') {
            loggedError = messageField;
          }
        }
      } catch {}
      if (loggedError.length > 1000) {
        loggedError = `${loggedError.slice(0, 1000)}... [truncated]`;
      }
      logger.error(`[PlatformApiClient] Job failed: ${loggedError}`);
      throw new GenericFailedError(sessionId);
    }

    const acceptHeader =
      options.acceptFormat === 'json' ? 'application/json' : 'application/octet-stream';
    const resultRes = await fetch(resultUrl, {
      headers: {
        ...(await this._requestHeaders(sessionId)),
        Accept: acceptHeader,
      },
      signal: AbortSignal.timeout(this._defaultTimeout),
    });
    await checkHttpResponse(resultRes, sessionId);

    const arrayBuffer = await resultRes.arrayBuffer();
    const contentType = resultRes.headers.get('content-type') ?? 'application/octet-stream';
    return { body: Buffer.from(arrayBuffer), contentType };
  }
}
