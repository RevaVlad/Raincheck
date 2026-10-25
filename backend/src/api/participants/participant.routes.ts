import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { registerJoinParticipantEndpoint } from './join.routes.js';
import { registerUpdateParticipantEndpoint } from './profile.routes.js';

export function registerParticipantEndpoints(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
) {
  registerJoinParticipantEndpoint(app, database);
  registerUpdateParticipantEndpoint(app, database);
}
