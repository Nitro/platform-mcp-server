import { logger } from './logger.js';
import { main } from './server.js';

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  logger.error(`Fatal startup failure: ${message}`);
  process.exit(1);
});
