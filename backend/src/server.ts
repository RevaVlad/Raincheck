import { buildApp } from './app.js';
import { loadConfig } from '#config/config';
import { createPrismaClient } from '#infrastructure/database/prisma-database';

const config = loadConfig();
const database = createPrismaClient(config);
const app = buildApp(config, database);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.close();
  } catch (error) {
    app.log.error(error, 'Shutdown failed');
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error, 'Startup failed');
  await app.close();
  process.exitCode = 1;
}
