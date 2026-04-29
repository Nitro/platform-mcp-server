import 'dotenv/config';
import { z } from 'zod';
import { defaultSessionFilePath } from './auth/pkceManager.js';
import type { PkceConfig } from './auth/pkceManager.js';

const _targetEnvSchema = z.enum(['dev', 'prod']);
const _authModeSchema = z.enum(['token-auth', 'client-credentials', 'pkce']);
const _nonEmptyString = z.string().min(1);

type TargetEnv = z.infer<typeof _targetEnvSchema>;
type AuthMode = z.infer<typeof _authModeSchema>;

const _INTERNAL_CONFIG = {
  apiUrls: {
    'dev:token-auth': 'https://api.gonitrodev.com/idp/platform',
    'dev:client-credentials': 'https://public-api.gonitrodev.com',
    'dev:pkce': 'https://api.gonitrodev.com/idp/platform',
    'prod:token-auth': 'https://api.gonitro.com/idp/platform',
    'prod:client-credentials': 'https://api.gonitro.dev',
    'prod:pkce': 'https://api.gonitro.com/idp/platform',
  } satisfies Record<`${TargetEnv}:${AuthMode}`, string>,
  pkceAuthUrls: {
    dev: 'https://auth.gonitrodev.com',
    prod: 'https://auth.gonitro.com',
  } satisfies Record<TargetEnv, string>,
  pkceClientIds: {
    dev: 'uSVEBaW8bzXo6wTjX9myzBafinXtHiC0',
    prod: 'RH4MAFXhbJfEtEIATXKzoOHqSsI833gp',
  } satisfies Record<TargetEnv, string>,
  pkceCallbackPorts: [27834, 41209, 53671, 19438, 62105],
} as const;

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

  get pkceConfig(): PkceConfig {
    if (this._authMode !== 'pkce') {
      throw new Error(
        `pkceConfig is only available in 'pkce' mode, current mode is '${this._authMode}'`,
      );
    }
    const refreshBufferMinutes = Number(process.env.NITRO_PKCE_REFRESH_BUFFER_MINUTES ?? '5');
    return {
      authUrl: _INTERNAL_CONFIG.pkceAuthUrls[this._targetEnv],
      clientId: _INTERNAL_CONFIG.pkceClientIds[this._targetEnv],
      callbackPorts: [..._INTERNAL_CONFIG.pkceCallbackPorts],
      refreshBufferMs: refreshBufferMinutes * 60 * 1000,
      sessionFilePath: defaultSessionFilePath(),
    };
  }

  get apiUrl(): string {
    return _INTERNAL_CONFIG.apiUrls[`${this._targetEnv}:${this._authMode}`];
  }

  get version(): string {
    return process.env.MCP_SERVER_VERSION ?? '0.0.0-dev';
  }
}

export const settings = new Settings();
