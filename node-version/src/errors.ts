import { z } from 'zod';

import { logger } from './logger.js';

const _httpErrorBodySchema = z.object({ title: z.string() });

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export class OperationTimeoutError extends Error {
  constructor(referenceCode?: string) {
    const base = "Your operation didn't complete in a reasonable amount of time.";
    super(appendReferenceCode(base, referenceCode));
    this.name = 'OperationTimeoutError';
  }
}

export class GenericFailedError extends Error {
  constructor(referenceCode?: string) {
    const base =
      'Platform operation failed. Try again or contact Nitro support if the issue persists.';
    super(appendReferenceCode(base, referenceCode));
    this.name = 'GenericFailedError';
  }
}

export function handleToolError(
  toolName: string,
  err: unknown,
  extraUserFacingClasses: (new (...args: never[]) => Error)[] = [],
): { isError: true; content: [{ type: 'text'; text: string }] } {
  const isUserFacing =
    err instanceof UserFacingError ||
    err instanceof GenericFailedError ||
    err instanceof OperationTimeoutError ||
    extraUserFacingClasses.some((cls) => err instanceof cls);
  const loggedError = err instanceof Error ? (err.stack ?? err.message) : String(err);
  if (isUserFacing) {
    logger.error(`[${toolName}] ${loggedError}`);
  } else {
    logger.error(`[${toolName}] Unexpected error: ${loggedError}`);
  }
  const message =
    isUserFacing && err instanceof Error ? err.message : new GenericFailedError().message;
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

async function _readBody(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

function _parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function checkHttpResponse(res: Response, sessionId?: string): Promise<void> {
  if (res.status === 200 || res.status === 202) return;

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const waitClause =
      retryAfter !== null ? ` Please wait ${retryAfter} seconds before trying again.` : '';
    throw new UserFacingError(`You have used up your current Nitro allowance.${waitClause}`);
  }

  const summary = { url: res.url, status: res.status };
  const bodyText = res.bodyUsed ? undefined : await _readBody(res);
  logger.error(`HTTP request failed: ${JSON.stringify(summary)}`);

  if (bodyText !== undefined && res.status < 500) {
    const result = _httpErrorBodySchema.safeParse(_parseJson(bodyText));
    if (result.success) {
      throw new UserFacingError(appendReferenceCode(result.data.title, sessionId));
    }
  }

  throw new GenericFailedError(sessionId);
}

export function appendReferenceCode(message: string, referenceCode?: string): string {
  return referenceCode !== undefined
    ? `${message} Please provide the following reference code to Nitro support: ${referenceCode}`
    : message;
}
