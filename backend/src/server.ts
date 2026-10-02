import { buildApp } from './app.js';
import { loadConfig } from '#config/config';
import { Database } from '#infrastructure/database/database';

const config = loadConfig();
const database = Database.create(config);
const app = buildApp(config, database);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.close();
    await database.close();
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
  await database.close();
  process.exitCode = 1;
}
