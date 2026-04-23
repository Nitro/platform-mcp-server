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

export async function checkHttpResponse(res: Response): Promise<void> {
  if (res.status !== 200 && res.status !== 202) {
    const summary = { url: res.url, status: res.status };
    if (!res.bodyUsed) {
      try {
        const body = await res.text();
        logger.error(`HTTP request failed: ${JSON.stringify({ ...summary, body: body.slice(0, 500) })}`);
      } catch {
        logger.error(`HTTP request failed: ${JSON.stringify(summary)}`);
      }
    } else {
      logger.error(`HTTP request failed: ${JSON.stringify(summary)}`);
    }
    throw new GenericFailedError();
  }
}
