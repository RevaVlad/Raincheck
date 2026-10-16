import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client.js';
import { AnalyticsService } from '#services/analytics/analytics.service';
import { GroupService } from '#services/group/group.service';
import { timeZoneOffsetMinutes } from '#shared/time/time-zone';
import { AppError } from './errors.js';
import { resolveParticipant } from './participant-identity.js';
import type {
  OptionalParticipantTokenHeadersDto,
  PollParamsDto,
  ViewerTimeZoneQueryDto,
} from './request-dtos.js';

const params = {
  type: 'object',
  additionalProperties: false,
  required: ['inviteCode', 'pollId'],
  properties: {
    inviteCode: { type: 'string', minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
    pollId: { type: 'string' },
  },
} as const;

const viewerTimeZone = {
  type: 'object',
  additionalProperties: false,
  required: ['timeZone'],
  properties: { timeZone: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;

function validateTimeZone(timeZone: string): string {
  try {
    timeZoneOffsetMinutes(timeZone, new Date());
    return timeZone;
  } catch {
    throw new AppError('INVALID_REQUEST', 400, 'A valid IANA time zone is required');
  }
}

// Keep the route table together so all analytics endpoints are visible in one place.
// eslint-disable-next-line max-lines-per-function
export function registerAnalyticsRoutes(
  app: FastifyInstance,
  database: Prisma.TransactionClient,
): void {
  const pollContext = async (request: { params: PollParamsDto }) => {
    const { inviteCode, pollId } = request.params;

    const group = await new GroupService(database).findByInviteCode(inviteCode);
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');

    const poll = await database.poll.findFirst({ where: { id: pollId, groupId: group.id } });
    if (!poll) throw new AppError('POLL_NOT_FOUND', 404, 'Poll not found');

    return { group, poll };
  };

  app.get<{
    Params: PollParamsDto;
    Headers: OptionalParticipantTokenHeadersDto;
    Querystring: ViewerTimeZoneQueryDto;
  }>(
    '/api/groups/:inviteCode/polls/:pollId/suggestions/me',
    { schema: { params, querystring: viewerTimeZone } },
    async (request) => {
      const timeZone = validateTimeZone(request.query.timeZone);
      const { group, poll } = await pollContext(request);
      const token = request.headers['x-participant-token'];
      const me = await resolveParticipant(database, token, group.id);

      const suggestions = await new AnalyticsService(database).suggestions(
        poll.id,
        me.id,
        timeZone,
      );

      return { suggestions };
    },
  );

  app.get<{ Params: PollParamsDto; Querystring: ViewerTimeZoneQueryDto }>(
    '/api/groups/:inviteCode/polls/:pollId/results',
    { schema: { params, querystring: viewerTimeZone } },
    async (request) => {
      const timeZone = validateTimeZone(request.query.timeZone);
      const { group, poll } = await pollContext(request);

      return new AnalyticsService(database).results(poll.id, group.id, timeZone);
    },
  );
}
