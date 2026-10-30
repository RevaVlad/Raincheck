import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { Registry } from '@prometheus-io/client';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Config } from '#config/config';
import { isDatabaseAvailable } from '#infrastructure/database/prisma-database';
import { configureHttpRequestDurationMetrics } from '#infrastructure/http-request-duration-metrics';
import type { PrismaClient } from './generated/prisma/client.js';
import { logger } from '#shared/logger';
import { registerApiErrorHandler } from './api/errors.js';
import { registerGroupRoutes } from './api/group-routes.js';
import { registerPollRoutes } from './api/poll-routes.js';
import { registerResponseRoutes } from './api/response-routes.js';
import { registerAnalyticsRoutes } from './api/analytics-routes.js';

type HealthDatabase = {
  isAvailable(): Promise<boolean>;
  close(): Promise<void>;
};

export function buildApp(
  config: Config,
  database: PrismaClient | HealthDatabase,
  httpMetricsRegistry?: Registry,
) {
  logger.level = config.logLevel;
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    logController: new Fastify.LogController({
      requestIdLogLabel: 'requestId',
      disableRequestLogging: true,
    }),
  });

  configureHttpRequestDurationMetrics(app, httpMetricsRegistry);
  registerRequestLogging(app);
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

function registerRequestLogging(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-ID', request.id);
  });
  app.addHook('onResponse', async (request, reply) => {
    const statusCode = reply.statusCode;
    if (request.routeOptions.url?.startsWith('/health/') && statusCode < 400) return;
    request.log[statusCode >= 500 ? 'error' : 'info'](
      {
        event: 'http.request.completed',
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        statusCode,
        duration_ms: reply.elapsedTime,
      },
      'HTTP request completed',
    );
  });
}
