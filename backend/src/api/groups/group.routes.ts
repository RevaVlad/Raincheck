import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { groupsCreated } from '#infrastructure/metrics';
import { GroupService } from '#services/group/group.service';
import { getGroupPreview } from '#services/group/get-group-preview';
import { inviteCodeParams } from '../common/params.schemas.js';
import { groupBody } from './group.schema.js';
import { toGroupDto, toGroupPreviewDto } from './group.mapper.js';
import type { CreateGroupBodyDto, InviteCodeParamsDto } from './group.dto.js';
import { validateCreateGroup } from './group.validation.js';

export function registerGroupEndpoints(app: FastifyInstance, database: Prisma.TransactionClient) {
  app.post<{ Body: CreateGroupBodyDto }>(
    '/api/groups',
    { schema: { body: groupBody }, preValidation: validateCreateGroup },
    async (request, reply) => {
      const group = await new GroupService(database).create(request.body);
      groupsCreated.inc();

      return reply.code(201).send({ group: toGroupDto(group), currentPoll: null });
    },
  );
  app.get<{ Params: InviteCodeParamsDto }>(
    '/api/groups/:inviteCode',
    { schema: { params: inviteCodeParams } },
    async (request) =>
      toGroupPreviewDto(await getGroupPreview(database, request.params.inviteCode)),
  );
}
