import Fastify from 'fastify';
import type { Config } from '#config/config';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { registerApiErrorHandler } from './api/errors.js';

export function buildApp(config: Config, database: Pick<PrismaDatabase, 'isAvailable' | 'close'>) {
  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: false,
  });

  app.addHook('onClose', () => database.close());
  registerApiErrorHandler(app);

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    if (await database.isAvailable()) return { status: 'ok' };
    return reply.code(503).send({ status: 'unavailable' });
  });

  return app;
}
