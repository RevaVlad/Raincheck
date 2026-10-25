import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { registerPollReadRoutes } from './polls/poll.read-routes.js';
import { registerPollWriteRoutes } from './polls/poll.write-routes.js';

export function registerPollRoutes(app: FastifyInstance, database: Prisma.TransactionClient): void {
  registerPollReadRoutes(app, database);
  registerPollWriteRoutes(app, database);
}
