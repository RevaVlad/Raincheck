import type { FastifyInstance } from 'fastify';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { AnalyticsService } from '#services/analytics/analytics.service';
import { GroupService } from '#services/group/group.service';
import { timeZoneOffsetMinutes } from '#shared/time/time-zone';
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
const viewerTimeZone = {
  type: 'object',
  additionalProperties: false,
  required: ['timeZone'],
  properties: { timeZone: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;
function asTimeZone(query: unknown): string {
  const { timeZone } = query as { timeZone: string };
  try {
    timeZoneOffsetMinutes(timeZone, new Date());
    return timeZone;
  } catch {
    throw new AppError('INVALID_REQUEST', 400, 'A valid IANA time zone is required');
  }
}
export function registerAnalyticsRoutes(app: FastifyInstance, database: PrismaDatabase): void {
  const pollContext = async (request: { params: unknown }) => {
    const { inviteCode, pollId } = request.params as { inviteCode: string; pollId: string };
    const group = await new GroupService(database).findByInviteCode(inviteCode);
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
    const poll = await database.client.poll.findFirst({ where: { id: pollId, groupId: group.id } });
    if (!poll) throw new AppError('POLL_NOT_FOUND', 404, 'Poll not found');
    return { group, poll };
  };
  app.get(
    '/api/groups/:inviteCode/polls/:pollId/suggestions/me',
    { schema: { params, querystring: viewerTimeZone } },
    async (request) => {
      const timeZone = asTimeZone(request.query);
      const { group, poll } = await pollContext(request);
      const token = (request.headers as Record<string, string | undefined>)['x-participant-token'];
      const me = await resolveParticipant(database, token, group.id);
      return {
        suggestions: await new AnalyticsService(database).suggestions(poll.id, me.id, timeZone),
      };
    },
  );
  app.get(
    '/api/groups/:inviteCode/polls/:pollId/results',
    { schema: { params, querystring: viewerTimeZone } },
    async (request) => {
      const timeZone = asTimeZone(request.query);
      const { group, poll } = await pollContext(request);
      return new AnalyticsService(database).results(poll.id, group.id, timeZone);
    },
  );
}
