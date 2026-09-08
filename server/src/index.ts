/**
 * Process entry point.
 *
 * Owns the things that belong to the process rather than the app: binding the
 * port, draining connections on shutdown, and making sure an unexpected fault
 * is logged before the process dies.
 */

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

// Touching the Firebase module here surfaces a credential problem at boot
// instead of on the first authenticated request.
import './config/firebase';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    'LokshinEats API listening.',
  );
});

/** Stop accepting connections, let in-flight requests finish, then exit. */
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down.');

  // If a request hangs, do not wait forever — the orchestrator will SIGKILL
  // us anyway, and exiting cleanly first keeps the logs readable.
  const forceExit = setTimeout(() => {
    logger.warn('Shutdown timed out; exiting forcefully.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Error while closing server.');
      process.exit(1);
    }
    logger.info('Shutdown complete.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection.');
});

process.on('uncaughtException', (error) => {
  // The process is in an undefined state after this point; log and let the
  // orchestrator restart us rather than limping on.
  logger.fatal({ err: error }, 'Uncaught exception — exiting.');
  process.exit(1);
});
