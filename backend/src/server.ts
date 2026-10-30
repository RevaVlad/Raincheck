import { buildApp } from './app.js';
import { loadConfig } from '#config/config';
import { createPrismaClient } from '#infrastructure/database/prisma-database';
import { logger } from '#shared/logger';

let shuttingDown = false;
let app: ReturnType<typeof buildApp> | undefined;

async function shutdown(signal?: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app?.close();
    if (signal) logger.info({ event: 'process.stopped', signal }, 'Raincheck API stopped');
  } catch (err) {
    logger.error({ event: 'process.shutdown_failed', err }, 'API shutdown failed');
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  const config = loadConfig();
  logger.level = config.logLevel;
  const database = createPrismaClient(config);
  app = buildApp(config, database);
  await app.listen({ host: config.host, port: config.port });
  logger.info(
    { event: 'process.started', host: config.host, port: config.port },
    'Raincheck API started',
  );
} catch (err) {
  logger.error({ event: 'process.startup_failed', err }, 'API startup failed');
  process.exitCode = 1;
  await shutdown();
}
