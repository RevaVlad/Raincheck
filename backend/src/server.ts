import { buildApp } from './app.js';
import { loadConfig } from '#config/config';
import { createPool } from '#db/pool';

const config = loadConfig();
const pool = createPool(config);
const app = buildApp(config, pool);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.close();
    await pool.end();
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
  await pool.end();
  process.exitCode = 1;
}
