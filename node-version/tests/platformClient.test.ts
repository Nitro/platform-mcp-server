import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { PlatformApiClient, createBytesFile } from '../src/client/platformClient.js';
import { ContentType } from '../src/client/enums.js';
import { GenericFailedError, UserFacingError } from '../src/errors.js';

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
    client = PlatformApiClient.fromStaticToken(baseUrl, authToken);
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
        return Promise.resolve(
          _makeSseResponse([
            `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'running', progress: 0.5 })}`,
            `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
          ]),
        );
      }
      return Promise.resolve(_makeResultResponse(resultContent, 'application/pdf'));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('pdf-bytes'));
    const result = await client.run('conversions', file, { method: null });

    expect(result.body).toEqual(resultContent);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws GenericFailedError with session reference code when job fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(
          _makeSseResponse([
            `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'failed', location: 'https://error.example.com/job-1' })}`,
          ]),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'api-error' } }), { status: 200 }),
      );
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('pdf-bytes'));
    const promise = client.run('conversions', file, { method: null });
    await expect(promise).rejects.toThrow(GenericFailedError);
    await expect(promise).rejects.toThrow(
      /Please provide the following reference code to Nitro support:/,
    );
  });

  it('throws GenericFailedError when submit returns non-202', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 500 }));

    const file = createBytesFile(ContentType.PDF, Buffer.from('pdf-bytes'));
    await expect(client.run('conversions', file, { method: null })).rejects.toThrow(
      GenericFailedError,
    );
  });

  it('uses a different session ID for each run() call', async () => {
    const _makeSuccessfulRun = (): MockInstance<typeof fetch> =>
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const urlStr = url instanceof URL ? url.href : (url as string);
        if (urlStr.includes('/conversions')) {
          return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
        }
        if (urlStr.includes('status.example.com')) {
          return Promise.resolve(
            _makeSseResponse([
              `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
            ]),
          );
        }
        return Promise.resolve(_makeResultResponse(Buffer.from('result'), 'application/pdf'));
      });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));

    const fetchMock1 = _makeSuccessfulRun();
    await client.run('conversions', file, { method: null });
    const sessionId1 = (fetchMock1.mock.calls[0]?.[1]?.headers as Record<string, string>)[
      'X-Analytics-Session-Id'
    ];

    vi.restoreAllMocks();

    const fetchMock2 = _makeSuccessfulRun();
    await client.run('conversions', file, { method: null });
    const sessionId2 = (fetchMock2.mock.calls[0]?.[1]?.headers as Record<string, string>)[
      'X-Analytics-Session-Id'
    ];

    expect(sessionId1).toBeDefined();
    expect(sessionId2).toBeDefined();
    expect(sessionId1).not.toBe(sessionId2);
  });

  it('sends X-Analytics-Session-Id header on all requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(
          _makeSseResponse([
            `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
          ]),
        );
      }
      return Promise.resolve(_makeResultResponse(Buffer.from('result'), 'application/pdf'));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await client.run('conversions', file, { method: null });

    const sessionIds = fetchMock.mock.calls.map((call) => {
      const headers = call[1]?.headers as Record<string, string> | undefined;
      return headers?.['X-Analytics-Session-Id'];
    });
    expect(sessionIds.every((id) => id !== undefined)).toBe(true);
    expect(new Set(sessionIds).size).toBe(1);
  });

  it('sends Authorization header on all requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(
          _makeSseResponse([
            `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
          ]),
        );
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
        return Promise.resolve(
          _makeSseResponse([
            `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
          ]),
        );
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

  it('throws GenericFailedError with reference code when SSE stream closes without a terminal event', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      return Promise.resolve(
        _makeSseResponse([
          `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'running', progress: 0.5 })}`,
        ]),
      );
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    const promise = client.run('conversions', file, { method: null });
    await expect(promise).rejects.toThrow(GenericFailedError);
    await expect(promise).rejects.toThrow(
      /Please provide the following reference code to Nitro support:/,
    );
  });

  it('sends X-Nitro-Client header on all requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      if (urlStr.includes('status.example.com')) {
        return Promise.resolve(
          _makeSseResponse([
            `event: message\ndata: ${JSON.stringify({ jobID: 'job-1', status: 'completed', location: 'https://result.example.com/job-1' })}`,
          ]),
        );
      }
      return Promise.resolve(_makeResultResponse(Buffer.from('result'), 'application/pdf'));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await client.run('conversions', file, { method: null });

    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Record<string, string> | undefined;
      expect(headers?.['X-Nitro-Client']).toMatch(/^mcp\//);
    }
  });

  it('throws UserFacingError with wait time when server returns 429 with Retry-After', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'Retry-After': '60' } }),
    );

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await expect(client.run('conversions', file, { method: null })).rejects.toThrow(
      new UserFacingError(
        'You have used up your current Nitro allowance. Please wait 60 seconds before trying again.',
      ),
    );
  });

  it('throws UserFacingError without wait time when server returns 429 with no Retry-After', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 429 }));

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    await expect(client.run('conversions', file, { method: null })).rejects.toThrow(
      new UserFacingError('You have used up your current Nitro allowance.'),
    );
  });

  it('throws GenericFailedError with reference code when SSE event contains malformed JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url instanceof URL ? url.href : (url as string);
      if (urlStr.includes('/conversions')) {
        return Promise.resolve(_makeJobResponse('https://status.example.com/job-1'));
      }
      return Promise.resolve(_makeSseResponse(['event: message\ndata: not-valid-json']));
    });

    const file = createBytesFile(ContentType.PDF, Buffer.from('bytes'));
    const promise = client.run('conversions', file, { method: null });
    await expect(promise).rejects.toThrow(GenericFailedError);
    await expect(promise).rejects.toThrow(
      /Please provide the following reference code to Nitro support:/,
    );
  });
});
