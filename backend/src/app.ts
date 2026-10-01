import Fastify from 'fastify';
import type { Config } from '#config/config';
import type { DatabaseHealth } from '#infrastructure/database/database-health';

export function buildApp(config: Config, database: DatabaseHealth) {
  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: false,
  });

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    if (await database.isAvailable()) return { status: 'ok' };
    return reply.code(503).send({ status: 'unavailable' });
  });

  return app;
}
