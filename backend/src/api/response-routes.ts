import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { registerResponseConfirmRoutes } from './responses/confirm.routes.js';
import { registerResponseDeleteRoutes } from './responses/delete.routes.js';
import { registerResponseReadRoutes } from './responses/read.routes.js';
import { registerResponseWriteRoutes } from './responses/write.routes.js';

export function registerResponseRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  registerResponseReadRoutes(app, database);
  registerResponseWriteRoutes(app, database);
  registerResponseDeleteRoutes(app, database);
  registerResponseConfirmRoutes(app, database);
}
