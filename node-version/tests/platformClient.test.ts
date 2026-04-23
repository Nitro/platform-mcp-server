import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformApiClient, createBytesFile } from '../src/client/platformClient.js';
import { ContentType } from '../src/client/enums.js';
import { GenericFailedError } from '../src/errors.js';

function _makeSseResponse(events: string[]): Response {
  const body = events.join('\n\n') + '\n\n';
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function _makeJobResponse(resultUrl: string): Response {
  return new Response(null, {
    status: 202,
    headers: { Location: resultUrl },
  });
}

function _makeResultResponse(content: Buffer, contentType: string): Response {
  return new Response(new Uint8Array(content), {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

describe('PlatformApiClient', () => {
  const baseUrl = 'https://api.example.com';
  const authToken = 'auth-token';
  let client: PlatformApiClient;

  beforeEach(() => {
    client = new PlatformApiClient(baseUrl, authToken);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits job, polls SSE, and returns result bytes', async () => {
    const resultContent = Buffer.from('result-bytes');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(_makeSseResponse([
          `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'running', progress: 0.5 })}`,
          `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
        ]));
      }
      return Promise.resolve(_makeResultResponse(resultContent, 'application/pdf'));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('pdf-bytes'));
    const result = await client.run('conversions', file, { method: null });

    expect(result.body).toEqual(resultContent);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws GenericFailedError when job fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(_makeSseResponse([
          `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'failed', location: 'https://error.example.com/job-1' })}`,
        ]));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: { message: 'api-error' } }), { status: 200 }));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('pdf-bytes'));
    await expect(client.run('conversions', file, { method: null })).rejects.toThrow(
      GenericFailedError,
    );
  });

  it('throws GenericFailedError when submit returns non-202', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    );

    const file = createBytesFile(ContentType.PDF, Buffer.from('pdf-bytes'));
    await expect(client.run('conversions', file, { method: null })).rejects.toThrow(
      GenericFailedError,
    );
  });

  it('sends Authorization header on all requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(_makeSseResponse([
          `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
        ]));
      }
      return Promise.resolve(_makeResultResponse(Buffer.from('result'), 'application/pdf'));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await client.run('conversions', file, { method: null });

    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBe(`Bearer ${authToken}`);
    }
  });

  it('sends Accept: text/event-stream on SSE request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(_makeSseResponse([
          `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
        ]));
      }
      return Promise.resolve(_makeResultResponse(Buffer.from('result'), 'application/pdf'));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await client.run('conversions', file, { method: null });

    const sseCall = fetchMock.mock.calls.find(([url]) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      return urlStr.includes('status.example.com');
    });
    expect(sseCall).toBeDefined();
    const headers = sseCall?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.Accept).toBe('text/event-stream');
  });

  it('throws when SSE stream closes without a terminal event', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      return Promise.resolve(_makeSseResponse([
        `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'running', progress: 0.5 })}`,
      ]));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await expect(client.run('conversions', file, { method: null })).rejects.toThrow(
      'SSE stream closed before job finished',
    );
  });

  it('throws when SSE event contains malformed JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      return Promise.resolve(_makeSseResponse(['event: message\ndata: not-valid-json']));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await expect(client.run('conversions', file, { method: null })).rejects.toThrow(
      'Failed to parse SSE event as JSON',
    );
  });
});
