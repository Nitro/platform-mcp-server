import { main } from './server.js';

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
