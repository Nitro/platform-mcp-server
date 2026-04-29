import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { logger } from '../logger.js';
import { AuthRequiredError } from './errors.js';

export interface PkceConfig {
  readonly authUrl: string;
  readonly clientId: string;
  readonly callbackPorts: number[];
  readonly refreshBufferMs: number;
  readonly sessionFilePath: string;
}

const _exchangeResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const _refreshResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const _sessionFileSchema = z.object({
  refreshToken: z.string().min(1),
});

function _defaultSessionFilePath(): string {
  return path.join(os.homedir(), '.nitro-mcp', 'session.json');
}

export function defaultSessionFilePath(): string {
  return _defaultSessionFilePath();
}

function _readRefreshToken(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = _sessionFileSchema.parse(JSON.parse(raw));
    return parsed.refreshToken;
  } catch {
    return null;
  }
}

function _writeRefreshToken(filePath: string, refreshToken: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ refreshToken }), { mode: 0o600 });
}

function _deleteSessionFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function _base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function _generateCodeVerifier(): string {
  return _base64UrlEncode(randomBytes(32));
}

function _generateCodeChallenge(verifier: string): string {
  return _base64UrlEncode(createHash('sha256').update(verifier).digest());
}

function _generateState(): string {
  return _base64UrlEncode(randomBytes(16));
}

export class PkceManager {
  private readonly _config: PkceConfig;
  private _accessToken: string | null = null;
  private _refreshToken: string | null = null;
  private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _flowStarted = false;
  private _codeVerifier: string | null = null;
  private _state: string | null = null;
  private _callbackServer: http.Server | null = null;

  constructor(config: PkceConfig) {
    this._config = config;
  }

  async initialize(): Promise<void> {
    const refreshToken = _readRefreshToken(this._config.sessionFilePath);
    if (refreshToken !== null) {
      try {
        await this._refresh(refreshToken);
      } catch (err) {
        logger.error(
          `[PkceManager] Failed to refresh token on startup: ${err instanceof Error ? err.message : String(err)}`,
        );
        _deleteSessionFile(this._config.sessionFilePath);
      }
    }
  }

  async getAccessToken(): Promise<string> {
    if (this._accessToken !== null) {
      return this._accessToken;
    }
    const authUrl = await this._startFlow();
    throw new AuthRequiredError(authUrl);
  }

  private _stopCallbackServer(): void {
    if (this._callbackServer !== null) {
      this._callbackServer.close();
      this._callbackServer = null;
    }
  }

  private _resetFlow(): void {
    this._stopCallbackServer();
    this._flowStarted = false;
    this._codeVerifier = null;
    this._state = null;
  }

  private _buildAuthUrl(codeChallenge: string, state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this._config.clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      scope: 'openid offline_access',
    });
    return `${this._config.authUrl}/authorize?${params.toString()}`;
  }

  private async _startFlow(): Promise<string> {
    if (this._flowStarted) {
      const verifier = this._codeVerifier ?? '';
      const port = this._config.callbackPorts[0] ?? 0;
      const redirectUri = `http://localhost:${String(port)}/callback`;
      const challenge = _generateCodeChallenge(verifier);
      return this._buildAuthUrl(challenge, this._state ?? '', redirectUri);
    }

    this._flowStarted = true;
    const verifier = _generateCodeVerifier();
    const state = _generateState();
    this._codeVerifier = verifier;
    this._state = state;

    const challenge = _generateCodeChallenge(verifier);

    for (const port of this._config.callbackPorts) {
      const redirectUri = `http://localhost:${String(port)}/callback`;
      const server = http.createServer((req, res) => {
        void this._handleCallback(req, res, redirectUri);
      });
      const bound = await new Promise<boolean>((resolve) => {
        server.once('listening', () => {
          logger.info(`[PkceManager] Callback server listening on port ${String(port)}`);
          resolve(true);
        });
        server.once('error', (err) => {
          logger.error(`[PkceManager] Callback server error on port ${String(port)}: ${err.message}`);
          resolve(false);
        });
        server.listen(port, 'localhost');
      });
      if (bound) {
        this._callbackServer = server;
        return this._buildAuthUrl(challenge, state, redirectUri);
      }
    }

    this._resetFlow();
    throw new Error('[PkceManager] All callback ports are in use. Please free a port and try again.');
  }

  private async _handleCallback(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    redirectUri: string,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost`);
    if (url.pathname !== '/callback') {
      res.writeHead(404);
      res.end();
      return;
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error !== null) {
      logger.error(`[PkceManager] Auth callback error: ${error}`);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><p>Authentication failed. Please retry from your AI assistant.</p></body></html>',
      );
      this._resetFlow();
      return;
    }

    if (code === null || state !== this._state) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<html><body><p>Something went wrong. Please retry from your AI assistant or contact Nitro support.</p></body></html>');
      this._resetFlow();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nitro PDF Services</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 12px; padding: 48px 56px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.08); max-width: 400px; }
    .logo { height: 32px; margin-bottom: 32px; }
    .tick { font-size: 48px; line-height: 1; margin-bottom: 16px; color: #22c55e; }
    h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #111; }
    p { margin: 0; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="https://www.gonitro.com/hubfs/Nitro_2025/logo-dark.svg" alt="Nitro">
    <div class="tick">✓</div>
    <h1>Authentication successful!</h1>
    <p>You can close this tab and return to your AI assistant.</p>
  </div>
</body>
</html>`);

    this._stopCallbackServer();

    try {
      await this._exchangeCode(code, redirectUri);
    } catch (err) {
      logger.error(
        `[PkceManager] Token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async _exchangeCode(code: string, redirectUri: string): Promise<void> {
    const verifier = this._codeVerifier;
    if (verifier === null) {
      throw new Error('[PkceManager] No code verifier available for token exchange');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this._config.clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });

    const res = await fetch(`${this._config.authUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`Token exchange failed with status ${String(res.status)}`);
    }

    const data = _exchangeResponseSchema.parse(await res.json());
    this._storeTokens(data.access_token, data.refresh_token, data.expires_in);
    this._resetFlow();
  }

  private async _refresh(refreshToken: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this._config.clientId,
      refresh_token: refreshToken,
    });

    const res = await fetch(`${this._config.authUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed with status ${String(res.status)}`);
    }

    const data = _refreshResponseSchema.parse(await res.json());
    this._storeTokens(data.access_token, refreshToken, data.expires_in);
  }

  private _storeTokens(accessToken: string, refreshToken: string, expiresInSeconds: number): void {
    this._accessToken = accessToken;
    this._refreshToken = refreshToken;
    _writeRefreshToken(this._config.sessionFilePath, refreshToken);
    this._scheduleRefresh(expiresInSeconds);
  }

  private _scheduleRefresh(expiresInSeconds: number): void {
    if (this._refreshTimer !== null) {
      clearTimeout(this._refreshTimer);
    }
    const delayMs = expiresInSeconds * 1000 - this._config.refreshBufferMs;
    const safeDelayMs = Math.max(delayMs, 0);
    this._refreshTimer = setTimeout(() => {
      void this._doProactiveRefresh();
    }, safeDelayMs);
  }

  private async _doProactiveRefresh(): Promise<void> {
    const refreshToken = this._refreshToken;
    if (refreshToken === null) {
      logger.error('[PkceManager] Proactive refresh: no refresh token in memory');
      this._accessToken = null;
      return;
    }
    try {
      await this._refresh(refreshToken);
    } catch (err) {
      logger.error(
        `[PkceManager] Proactive refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this._accessToken = null;
      this._refreshToken = null;
      _deleteSessionFile(this._config.sessionFilePath);
    }
  }
}
