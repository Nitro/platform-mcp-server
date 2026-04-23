import 'dotenv/config';

type TargetEnv = 'dev' | 'prod';
type AuthMode = 'token-auth' | 'client-credentials';

const API_URLS: Record<`${TargetEnv}:${AuthMode}`, string> = {
  'dev:token-auth': 'https://api.gonitrodev.com/idp/platform',
  'dev:client-credentials': 'https://public-api.gonitrodev.com',
  'prod:token-auth': 'https://api.gonitro.com/idp/platform',
  'prod:client-credentials': 'https://api.gonitro.dev',
};

function _readTargetEnv(): TargetEnv {
  const raw = process.env.NITRO_TARGET_ENV ?? 'dev';
  if (raw !== 'dev' && raw !== 'prod') {
    throw new Error(`NITRO_TARGET_ENV must be 'dev' or 'prod', got: ${raw}`);
  }
  return raw;
}

function _readAuthMode(): AuthMode {
  const raw = process.env.NITRO_AUTH_MODE ?? 'token-auth';
  if (raw !== 'token-auth' && raw !== 'client-credentials') {
    throw new Error(
      `NITRO_AUTH_MODE must be 'token-auth' or 'client-credentials', got: ${raw}`,
    );
  }
  return raw;
}

class Settings {
  private readonly _targetEnv: TargetEnv;
  private readonly _authMode: AuthMode;

  constructor() {
    this._targetEnv = _readTargetEnv();
    this._authMode = _readAuthMode();
  }

  get targetEnv(): TargetEnv {
    return this._targetEnv;
  }

  get authMode(): AuthMode {
    return this._authMode;
  }

  get authToken(): string {
    if (this._authMode !== 'token-auth') {
      throw new Error(`authToken is only available in 'token-auth' mode, current mode is '${this._authMode}'`);
    }
    const value = process.env.NITRO_AUTH_TOKEN;
    if (value === undefined || value === '') {
      throw new Error('NITRO_AUTH_TOKEN environment variable is required');
    }
    return value;
  }

  get clientCredentials(): { clientId: string; clientSecret: string } {
    if (this._authMode !== 'client-credentials') {
      throw new Error(`clientCredentials is only available in 'client-credentials' mode, current mode is '${this._authMode}'`);
    }
    const clientId = process.env.NITRO_CLIENT_ID;
    const clientSecret = process.env.NITRO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('NITRO_CLIENT_ID and NITRO_CLIENT_SECRET environment variables are required');
    }
    return { clientId, clientSecret };
  }

  get apiUrl(): string {
    return API_URLS[`${this._targetEnv}:${this._authMode}`];
  }

  get version(): string {
    return process.env.MCP_SERVER_VERSION ?? '0.0.0-dev';
  }
}

export const settings = new Settings();
