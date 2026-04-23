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

export function checkHttpResponse(res: Response): void {
  if (res.status !== 200 && res.status !== 202) {
    throw new GenericFailedError();
  }
}
