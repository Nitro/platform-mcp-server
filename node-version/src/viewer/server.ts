/*
  server.ts — Express app creation and lifecycle management.

  Responsibilities:
    - Create the Express app with the right middleware
    - Start listening on a port (picking a free one if needed)
    - Stop the server cleanly
    - Expose the URL the viewer is reachable at

  This module intentionally knows nothing about MCP, file paths, or PDF logic.
  It's purely about "run an HTTP server, stop an HTTP server."
*/

import http from 'node:http';
import express from 'express';
import { registerRoutes } from './routes.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/*
  ViewerServer is the object we hand back to the MCP tool.
  It carries the URL (so the tool can pass it to preview_start)
  and a stop() method to clean up when done.
*/
export interface ViewerServer {
  readonly url: string; // e.g. "http://localhost:3742"
  stop: () => Promise<void>; // closes the HTTP server
}

// ── Private helpers ───────────────────────────────────────────────────────────

/*
  _startOnPort — attempt to bind Express to a specific port.

  Returns a Promise that resolves to the http.Server if the port is free,
  or rejects if the port is already in use (EADDRINUSE error).

  Why a Promise here instead of a callback?
  Node's server.listen() uses callbacks — this wrapper converts it to a
  Promise so we can use `await` cleanly in the calling code.
*/
function _startOnPort(app: express.Express, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);

    server.once('error', reject);

    server.listen(port, '127.0.0.1', () => {
      // Remove the error listener once we've successfully bound
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

/*
  _findFreePort — try ports in range until one is free.

  We start at a high port (3742) to avoid clashing with common dev servers
  (3000, 8080, etc.). Tries up to 20 consecutive ports before giving up.
*/
async function _findFreePort(app: express.Express, startPort: number): Promise<http.Server> {
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    try {
      return await _startOnPort(app, port);
    } catch (err) {
      // EADDRINUSE means the port is taken — try the next one
      const isPortTaken = err instanceof Error && 'code' in err && err.code === 'EADDRINUSE';
      if (!isPortTaken || i === maxAttempts - 1) {
        throw err; // something else went wrong, or we ran out of ports
      }
    }
  }

  // TypeScript needs this even though the loop always throws or returns
  throw new Error('No free port found');
}

// ── Public API ────────────────────────────────────────────────────────────────

/*
  startViewerServer — create, configure, and start the Express server.

  Returns a ViewerServer with the URL and a stop() method.

  Usage (from the MCP tool):
    const viewer = await startViewerServer();
    // viewer.url = "http://localhost:3742"
    // pass viewer.url + "?file=..." to preview_start
    // later:
    await viewer.stop();
*/
export async function startViewerServer(): Promise<ViewerServer> {
  const app = express();

  // Middleware: parse incoming JSON request bodies.
  // Without this, req.body would be undefined in the POST /save handler.
  // express.json() reads the raw body stream and parses it into req.body.
  app.use(express.json());

  // Attach all route handlers defined in routes.ts
  registerRoutes(app);

  // Find a free port and start listening
  const server = await _findFreePort(app, 3742);

  // server.address() returns { address, family, port } once listening
  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 3742;
  const url = `http://127.0.0.1:${String(port)}`;

  return {
    url,

    // stop() closes the server and waits for all connections to finish.
    // Wrapping in a Promise converts the callback-based server.close() to async/await.
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
