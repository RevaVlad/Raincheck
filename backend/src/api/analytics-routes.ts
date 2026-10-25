import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { registerAnalyticsReadRoutes } from './analytics/analytics.read-routes.js';

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  registerAnalyticsReadRoutes(app, database);
}
