import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { toInterval } from '#infrastructure/database/prisma-records';
import type { IntervalInput } from '#domain/interval/interval';
import { GroupService } from '#services/group/group.service';
import { IntervalService } from '#services/interval/interval.service';
import { ResponseService } from '#services/response/response.service';
import { AppError } from './errors.js';
import { resolveParticipant } from './participant-identity.js';

const params = {
  type: 'object',
  additionalProperties: false,
  required: ['inviteCode', 'pollId'],
  properties: {
    inviteCode: { type: 'string', minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
    pollId: { type: 'string' },
  },
} as const;
const intervals = {
  type: 'object',
  additionalProperties: false,
  required: ['intervals'],
  properties: {
    intervals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['startAt', 'endAt', 'kind', 'preferenceDirection'],
        properties: {
          startAt: { type: 'string', format: 'date-time', pattern: 'Z$' },
          endAt: { type: 'string', format: 'date-time', pattern: 'Z$' },
          kind: { type: 'string', enum: ['UNAVAILABLE', 'IF_NEEDED', 'PREFERRED'] },
          preferenceDirection: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;
const key = (request: { params: unknown; headers: unknown }) => ({
  inviteCode: (request.params as { inviteCode: string }).inviteCode,
  pollId: (request.params as { pollId: string }).pollId,
  token: (request.headers as Record<string, string | undefined>)['x-participant-token'],
});

function mapClosedPollWrite(error: unknown): void {
  if (error instanceof Error && error.message === 'Response requires an open poll')
    throw new AppError('POLL_STATE_CONFLICT', 409, 'Poll state conflict');
}

// Keep the route table together so all response endpoints are visible in one place.
// eslint-disable-next-line max-lines-per-function
export function registerResponseRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  const context = async (request: { params: unknown; headers: unknown }) => {
    const value = key(request);
    const group = await new GroupService(database).findByInviteCode(value.inviteCode);
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
    const me = await resolveParticipant(database, value.token, group.id);
    const poll = await database.poll.findFirst({
      where: { id: value.pollId, groupId: group.id },
    });
    if (!poll) throw new AppError('POLL_NOT_FOUND', 404, 'Poll not found');
    return { ...value, me, poll };
  };
  const dto = async (response: { id: string; state: string; confirmedAt: Date | null }) => ({
    id: response.id,
    state: response.state,
    confirmedAt: response.confirmedAt?.toISOString() ?? null,
    intervals: (
      await database.availabilityInterval.findMany({
        where: { responseId: response.id },
        orderBy: [{ startAt: 'asc' }],
      })
    ).map(toInterval),
  });
  app.post(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params } },
    async (request, reply) => {
      const { pollId, me } = await context(request);
      try {
        return reply
          .code(201)
          .send(await dto(await new ResponseService(database).create(pollId, me.id)));
      } catch (error) {
        mapClosedPollWrite(error);
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002'
        )
          throw new AppError('RESPONSE_ALREADY_EXISTS', 409, 'Response already exists');
        throw error;
      }
    },
  );
  app.get(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params } },
    async (request) => {
      const { pollId, me } = await context(request);
      const response = await new ResponseService(database).findForParticipant(pollId, me.id);
      if (!response) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');
      return dto(response);
    },
  );
  app.put(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params, body: intervals } },
    async (request) => {
      const { pollId, me } = await context(request);
      const response = await new ResponseService(database).findForParticipant(pollId, me.id);
      if (!response) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');
      try {
        await new IntervalService(database).replace(
          response.id,
          (request.body as { intervals: IntervalInput[] }).intervals,
        );
        const updated = await new ResponseService(database).findForParticipant(pollId, me.id);
        if (!updated) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');
        return dto(updated);
      } catch (error) {
        mapClosedPollWrite(error);
        throw error;
      }
    },
  );
  app.delete(
    '/api/groups/:inviteCode/polls/:pollId/responses/me',
    { schema: { params } },
    async (request, reply) => {
      const { pollId, me } = await context(request);
      try {
        if (!(await new ResponseService(database).deleteForOpenPoll(pollId, me.id)))
          throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');
      } catch (error) {
        mapClosedPollWrite(error);
        throw error;
      }
      return reply.code(204).send();
    },
  );
  app.post(
    '/api/groups/:inviteCode/polls/:pollId/responses/me/confirm',
    { schema: { params } },
    async (request) => {
      const { pollId, me } = await context(request);
      const response = await new ResponseService(database).findForParticipant(pollId, me.id);
      if (!response) throw new AppError('RESPONSE_NOT_FOUND', 404, 'Response not found');
      try {
        return dto(await new ResponseService(database).confirm(response.id));
      } catch (error) {
        mapClosedPollWrite(error);
        throw error;
      }
    },
  );
}
