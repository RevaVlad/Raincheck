import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { registerGroupEndpoints } from './groups/group.routes.js';
import { registerParticipantEndpoints } from './participants/participant.routes.js';
import { registerWorkspaceEndpoint } from './groups/workspace.routes.js';

export function registerGroupRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  registerGroupEndpoints(app, database);
  registerParticipantEndpoints(app, database);
  registerWorkspaceEndpoint(app, database);
}
