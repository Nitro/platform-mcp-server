import { UserFacingError } from '../errors.js';

export class AuthRequiredError extends UserFacingError {
  constructor(authUrl: string) {
    super(
      `Authentication required. Please open the following link in your browser to log in to Nitro PDF Services: ${authUrl}. Once complete, retry your request.`,
    );
    this.name = 'AuthRequiredError';
  }
}
