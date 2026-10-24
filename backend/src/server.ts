import { buildApp } from './app.js';
import { buildMetricsApp } from './metrics-app.js';
import { loadConfig } from '#config/config';
import { createPrismaClient } from '#infrastructure/database/prisma-database';
import { logger } from '#shared/logger';

let shuttingDown = false;
let app: ReturnType<typeof buildApp> | undefined;
let metricsApp: ReturnType<typeof buildMetricsApp> | undefined;

async function shutdown(signal?: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    const results = await Promise.allSettled([metricsApp?.close(), app?.close()]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
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
  metricsApp = buildMetricsApp();
  await metricsApp.listen({ host: config.host, port: 9464 });
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
