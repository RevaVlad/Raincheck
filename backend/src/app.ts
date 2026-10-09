import Fastify from 'fastify';
import type { Config } from '#config/config';
import { isDatabaseAvailable } from '#infrastructure/database/prisma-database';
import type { PrismaClient } from './generated/prisma/client.js';
import { registerApiErrorHandler } from './api/errors.js';
import { registerGroupRoutes } from './api/group-routes.js';
import { registerPollRoutes } from './api/poll-routes.js';
import { registerResponseRoutes } from './api/response-routes.js';
import { registerAnalyticsRoutes } from './api/analytics-routes.js';

type HealthDatabase = {
  isAvailable(): Promise<boolean>;
  close(): Promise<void>;
};

export function buildApp(config: Config, database: PrismaClient | HealthDatabase) {
  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: false,
  });

  app.addHook('onClose', () => {
    if ('close' in database) return database.close();
    return database.$disconnect();
  });
  registerApiErrorHandler(app);
  if (!('close' in database)) {
    registerGroupRoutes(app, database);
    registerPollRoutes(app, database);
    registerResponseRoutes(app, database);
    registerAnalyticsRoutes(app, database);
  }

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    if ('close' in database) {
      if (await database.isAvailable()) return { status: 'ok' };
    } else if (await isDatabaseAvailable(database)) return { status: 'ok' };
    return reply.code(503).send({ status: 'unavailable' });
  });

  return app;
}
