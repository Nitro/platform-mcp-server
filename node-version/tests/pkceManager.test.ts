import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequiredError } from '../src/auth/errors.js';
import { PkceManager } from '../src/auth/pkceManager.js';
import type { PkceConfig } from '../src/auth/pkceManager.js';

let _tmpDir: string;
let _sessionFile: string;
let _port: number;
let _config: PkceConfig;

function _makeTokenResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function _makeRefreshResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600, ...overrides }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

async function _getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, 'localhost', () => {
      const addr = srv.address();
      srv.close(() => {
        resolve((addr as net.AddressInfo).port);
      });
    });
    srv.on('error', reject);
  });
}

describe('PkceManager', () => {
  beforeEach(async () => {
    _tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nitro-pkce-test-'));
    _sessionFile = path.join(_tmpDir, 'session.json');
    _port = await _getFreePort();
    _config = {
      authUrl: 'https://auth.example.com',
      clientId: 'client-id',
      callbackPorts: [_port],
      refreshBufferMs: 0,
      sessionFilePath: _sessionFile,
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    fs.rmSync(_tmpDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('does nothing when no session file exists', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      const manager = new PkceManager(_config);

      await manager.initialize();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refreshes access token from session file on startup', async () => {
      fs.writeFileSync(_sessionFile, JSON.stringify({ refreshToken: 'stored-refresh-token' }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        _makeRefreshResponse({ access_token: 'new-access-token' }),
      );

      const manager = new PkceManager(_config);
      await manager.initialize();

      await expect(manager.getAccessToken()).resolves.toBe('new-access-token');
    });

    it('deletes session file and does not throw when refresh fails', async () => {
      fs.writeFileSync(_sessionFile, JSON.stringify({ refreshToken: 'expired-token' }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));

      const manager = new PkceManager(_config);
      await expect(manager.initialize()).resolves.not.toThrow();

      expect(fs.existsSync(_sessionFile)).toBe(false);
    });

    it('does not call fetch when session file contains invalid JSON', async () => {
      fs.writeFileSync(_sessionFile, 'not-valid-json');
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      const manager = new PkceManager(_config);
      await manager.initialize();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getAccessToken', () => {
    it('returns access token when already authenticated', async () => {
      fs.writeFileSync(_sessionFile, JSON.stringify({ refreshToken: 'refresh-token' }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        _makeRefreshResponse({ access_token: 'my-token' }),
      );

      const manager = new PkceManager(_config);
      await manager.initialize();

      await expect(manager.getAccessToken()).resolves.toBe('my-token');
    });

    it('throws AuthRequiredError when no access token', async () => {
      const manager = new PkceManager(_config);

      await expect(manager.getAccessToken()).rejects.toThrow(AuthRequiredError);
    });

    it('auth URL contains correct params', async () => {
      const manager = new PkceManager(_config);

      const err = await manager.getAccessToken().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AuthRequiredError);
      const authUrl = new URL((err as AuthRequiredError).authUrl);
      expect(authUrl.searchParams.get('client_id')).toBe('client-id');
      expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authUrl.searchParams.get('scope')).toBe('openid offline_access');
      expect(authUrl.searchParams.get('redirect_uri')).toBe(
        `http://localhost:${String(_port)}/callback`,
      );
    });

    it('returns same auth URL state when called again mid-flow', async () => {
      const manager = new PkceManager(_config);

      const err1 = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;
      const err2 = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;

      expect(new URL(err1.authUrl).searchParams.get('state')).toBe(
        new URL(err2.authUrl).searchParams.get('state'),
      );
    });
  });

  describe('callback handling', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('exchanges code and stores access token after successful callback', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(_makeTokenResponse());

      const manager = new PkceManager(_config);
      const err = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;
      const state = new URL(err.authUrl).searchParams.get('state') ?? '';

      await _simulateCallback(_port, `/callback?code=auth-code&state=${state}`);

      await expect(manager.getAccessToken()).resolves.toBe('access-token');
    });

    it('writes refresh token to session file after successful exchange', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        _makeTokenResponse({ refresh_token: 'new-refresh-token' }),
      );

      const manager = new PkceManager(_config);
      const err = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;
      const state = new URL(err.authUrl).searchParams.get('state') ?? '';

      await _simulateCallback(_port, `/callback?code=auth-code&state=${state}`);

      const session = JSON.parse(fs.readFileSync(_sessionFile, 'utf-8')) as {
        refreshToken: string;
      };
      expect(session.refreshToken).toBe('new-refresh-token');
    });

    it('resets flow on auth callback error so next getAccessToken starts a fresh flow', async () => {
      const manager = new PkceManager(_config);
      const err1 = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;
      const state1 = new URL(err1.authUrl).searchParams.get('state');

      await _simulateCallback(_port, '/callback?error=access_denied');

      const err2 = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;
      expect(new URL(err2.authUrl).searchParams.get('state')).not.toBe(state1);
    });

    it('resets flow on invalid state param', async () => {
      const manager = new PkceManager(_config);
      const err1 = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;
      const state1 = new URL(err1.authUrl).searchParams.get('state');

      await _simulateCallback(_port, '/callback?code=auth-code&state=wrong-state');

      const err2 = (await manager.getAccessToken().catch((e: unknown) => e)) as AuthRequiredError;
      expect(new URL(err2.authUrl).searchParams.get('state')).not.toBe(state1);
    });
  });

  describe('proactive token refresh', () => {
    it('schedules and performs proactive refresh before expiry', async () => {
      fs.writeFileSync(_sessionFile, JSON.stringify({ refreshToken: 'refresh-token' }));
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          _makeRefreshResponse({ access_token: 'first-token', expires_in: 100 }),
        )
        .mockResolvedValueOnce(
          _makeRefreshResponse({ access_token: 'refreshed-token', expires_in: 3600 }),
        );

      const manager = new PkceManager({ ..._config, refreshBufferMs: 5_000 });
      await manager.initialize();

      await expect(manager.getAccessToken()).resolves.toBe('first-token');
      await vi.advanceTimersByTimeAsync(95_000);

      await expect(manager.getAccessToken()).resolves.toBe('refreshed-token');
    });

    it('clears access token and deletes session file when proactive refresh fails', async () => {
      fs.writeFileSync(_sessionFile, JSON.stringify({ refreshToken: 'refresh-token' }));
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(_makeRefreshResponse({ expires_in: 100 }))
        .mockResolvedValueOnce(new Response(null, { status: 401 }));

      const manager = new PkceManager({ ..._config, refreshBufferMs: 5_000 });
      await manager.initialize();

      await vi.advanceTimersByTimeAsync(95_000);

      await expect(manager.getAccessToken()).rejects.toThrow(AuthRequiredError);
      expect(fs.existsSync(_sessionFile)).toBe(false);
    });
  });
});

async function _simulateCallback(port: number, callbackPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port, path: callbackPath, method: 'GET' },
      (res) => {
        res.resume();
        res.on('end', resolve);
      },
    );
    req.on('error', reject);
    req.end();
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
}
