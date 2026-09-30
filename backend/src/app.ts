import Fastify from 'fastify';
import type { Pool } from 'pg';
import type { Config } from '#config/config';

export function buildApp(config: Config, db: Pick<Pool, 'query'>) {
  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: false,
  });

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    try {
      await db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  return app;
}
