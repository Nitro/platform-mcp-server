import 'dotenv/config';
import { z } from 'zod';

const _targetEnvSchema = z.enum(['dev', 'prod']);
const _authModeSchema = z.enum(['token-auth', 'client-credentials']);
const _nonEmptyString = z.string().min(1);

type TargetEnv = z.infer<typeof _targetEnvSchema>;
type AuthMode = z.infer<typeof _authModeSchema>;

const API_URLS: Record<`${TargetEnv}:${AuthMode}`, string> = {
  'dev:token-auth': 'https://api.gonitrodev.com/idp/platform',
  'dev:client-credentials': 'https://public-api.gonitrodev.com',
  'prod:token-auth': 'https://api.gonitro.com/idp/platform',
  'prod:client-credentials': 'https://api.gonitro.dev',
};

function _readTargetEnv(): TargetEnv {
  return _targetEnvSchema.parse(process.env.NITRO_TARGET_ENV ?? 'dev');
}

function _readAuthMode(): AuthMode {
  return _authModeSchema.parse(process.env.NITRO_AUTH_MODE ?? 'token-auth');
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
      throw new Error(
        `authToken is only available in 'token-auth' mode, current mode is '${this._authMode}'`,
      );
    }
    return _nonEmptyString.parse(process.env.NITRO_AUTH_TOKEN);
  }

  get clientCredentials(): { clientId: string; clientSecret: string } {
    if (this._authMode !== 'client-credentials') {
      throw new Error(
        `clientCredentials is only available in 'client-credentials' mode, current mode is '${this._authMode}'`,
      );
    }
    return {
      clientId: _nonEmptyString.parse(process.env.NITRO_CLIENT_ID),
      clientSecret: _nonEmptyString.parse(process.env.NITRO_CLIENT_SECRET),
    };
  }

  get apiUrl(): string {
    return API_URLS[`${this._targetEnv}:${this._authMode}`];
  }

  get version(): string {
    return process.env.MCP_SERVER_VERSION ?? '0.0.0-dev';
  }
}

export const settings = new Settings();
