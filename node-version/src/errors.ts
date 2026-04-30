import { z } from 'zod';

import { logger } from './logger.js';

const _httpErrorBodySchema = z.object({ title: z.string() });

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export class GenericFailedError extends Error {
  constructor(referenceCode?: string) {
    const base =
      'Platform operation failed. Try again or contact Nitro support if the issue persists.';
    const message =
      referenceCode !== undefined
        ? `${base} Please provide the following reference code to Nitro support: ${referenceCode}`
        : base;
    super(message);
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
    extraUserFacingClasses.some((cls) => err instanceof cls);
  if (!isUserFacing) {
    const loggedError = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logger.error(`[${toolName}] Unexpected error: ${loggedError}`);
  }
  const message =
    isUserFacing && err instanceof Error ? err.message : new GenericFailedError().message;
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

export async function checkHttpResponse(res: Response, sessionId?: string): Promise<void> {
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const waitClause =
      retryAfter !== null ? ` Please wait ${retryAfter} seconds before trying again.` : '';
    throw new UserFacingError(`You have used up your current Nitro allowance.${waitClause}`);
  }
  if (res.status !== 200 && res.status !== 202) {
    const summary = { url: res.url, status: res.status };
    if (!res.bodyUsed) {
      let bodyText: string | undefined;
      try {
        bodyText = await res.text();
      } catch {
        // ignore read failure; fall through to log without body
      }
      logger.error(
        `HTTP request failed: ${JSON.stringify({ ...summary, body: bodyText !== undefined ? bodyText.slice(0, 500) : undefined })}`,
      );
      if (bodyText !== undefined && res.status < 500) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          // intentionally empty
        }
        const result = _httpErrorBodySchema.safeParse(parsed);
        if (result.success) {
          throw new UserFacingError(appendReferenceCode(result.data.title, sessionId));
        }
      }
    } else {
      logger.error(`HTTP request failed: ${JSON.stringify(summary)}`);
    }
    throw new GenericFailedError(sessionId);
  }
}

export function appendReferenceCode(message: string, referenceCode?: string): string {
  return referenceCode !== undefined
    ? `${message} Please provide the following reference code to Nitro support: ${referenceCode}`
    : message;
}
