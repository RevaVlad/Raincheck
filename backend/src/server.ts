import { buildApp } from './app.js';
import { loadConfig } from '#config/config';
import { createOrm } from '#infrastructure/database/create-orm';
import { MikroDatabaseHealth } from '#infrastructure/database/database-health';

const config = loadConfig();
const orm = await createOrm(config);
const app = buildApp(config, new MikroDatabaseHealth(orm));

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.close();
    await orm.close(true);
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
  await orm.close(true);
  process.exitCode = 1;
}
