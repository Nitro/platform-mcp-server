import { logger } from './logger.js';

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export class GenericFailedError extends Error {
  constructor() {
    super('Platform operation failed. Try again or contact Nitro support if the issue persists.');
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

export async function checkHttpResponse(res: Response): Promise<void> {
  if (res.status !== 200 && res.status !== 202) {
    const summary = { url: res.url, status: res.status };
    if (!res.bodyUsed) {
      try {
        const body = await res.text();
        logger.error(
          `HTTP request failed: ${JSON.stringify({ ...summary, body: body.slice(0, 500) })}`,
        );
      } catch {
        logger.error(`HTTP request failed: ${JSON.stringify(summary)}`);
      }
    } else {
      logger.error(`HTTP request failed: ${JSON.stringify(summary)}`);
    }
    throw new GenericFailedError();
  }
}
