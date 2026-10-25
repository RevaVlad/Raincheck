import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { getWorkspace } from '#services/group/get-workspace';
import { optionalParticipantTokenHeaders } from '../schemas.js';
import { inviteCodeParams } from '../common/params.schemas.js';
import type { InviteCodeParamsDto } from './group.dto.js';
import type { OptionalParticipantTokenHeadersDto } from '../participants/participant.dto.js';
import { toWorkspaceDto } from './workspace.mapper.js';

export function registerWorkspaceEndpoint(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
) {
  app.get<{ Params: InviteCodeParamsDto; Headers: OptionalParticipantTokenHeadersDto }>(
    '/api/groups/:inviteCode/workspace',
    { schema: { params: inviteCodeParams, headers: optionalParticipantTokenHeaders } },
    async (request) =>
      toWorkspaceDto(
        await getWorkspace(
          database,
          request.params.inviteCode,
          request.headers['x-participant-token'],
        ),
      ),
  );
}
