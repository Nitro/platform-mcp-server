import 'dotenv/config';
import os from 'node:os';
import { z } from 'zod';
import { defaultSessionFilePath } from './auth/pkceManager.js';
import type { PkceConfig } from './auth/pkceManager.js';

const _targetEnvSchema = z.enum(['dev', 'prod']);

type TargetEnv = z.infer<typeof _targetEnvSchema>;

const _INTERNAL_CONFIG = {
  apiUrls: {
    dev: 'https://api.gonitrodev.com/idp/platform',
    prod: 'https://api.gonitro.com/idp/platform',
  } satisfies Record<TargetEnv, string>,
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

class Settings {
  private readonly _targetEnv: TargetEnv;

  constructor() {
    this._targetEnv = _readTargetEnv();
  }

  get targetEnv(): TargetEnv {
    return this._targetEnv;
  }

  get pkceConfig(): PkceConfig {
    const refreshBufferMinutes = Number(process.env.NITRO_PKCE_REFRESH_BUFFER_MINUTES ?? '5');
    return {
      authUrl: _INTERNAL_CONFIG.pkceAuthUrls[this._targetEnv],
      clientId: _INTERNAL_CONFIG.pkceClientIds[this._targetEnv],
      callbackPorts: [..._INTERNAL_CONFIG.pkceCallbackPorts],
      refreshBufferMs: refreshBufferMinutes * 60 * 1000,
      sessionFilePath: defaultSessionFilePath(),
    };
  }

  get baseDir(): string {
    const raw = process.env.NITRO_BASE_DIR?.trim();
    // The host substitutes ${user_config.*} placeholders, but hands them
    // through verbatim when the user leaves the field untouched. An
    // unexpanded placeholder is not a usable path, so treat it as unset.
    if (raw === undefined || raw === '' || /\$\{[^}]*\}/.test(raw)) {
      return os.homedir();
    }
    return raw;
  }

  get apiUrl(): string {
    return _INTERNAL_CONFIG.apiUrls[this._targetEnv];
  }

  readonly name = 'Nitro PDF Services';

  get version(): string {
    return process.env.MCP_SERVER_VERSION ?? '0.0.0-dev';
  }
}

export const settings = new Settings();
