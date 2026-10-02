import type { FastifyInstance } from 'fastify';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { GroupService } from '#services/group/group.service';
import { AppError } from './errors.js';
import { resolveParticipant } from './participant-identity.js';

const params = { type: 'object', additionalProperties: false, required: ['inviteCode', 'pollId'], properties: { inviteCode: { type: 'string', minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' }, pollId: { type: 'string' } } } as const;
function clock(value: Date) { return value.toISOString().slice(11, 16); }
function date(value: Date) { return value.toISOString().slice(0, 10); }
export function registerAnalyticsRoutes(app: FastifyInstance, database: PrismaDatabase): void {
  const pollContext = async (request: { params: unknown }) => { const { inviteCode, pollId } = request.params as { inviteCode: string; pollId: string }; const group = await new GroupService(database).findByInviteCode(inviteCode); if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found'); const poll = await database.client.poll.findFirst({ where: { id: pollId, groupId: group.id } }); if (!poll) throw new AppError('POLL_NOT_FOUND', 404, 'Poll not found'); return { group, poll }; };
  app.get('/api/groups/:inviteCode/polls/:pollId/suggestions/me', { schema: { params } }, async (request) => {
    const { group, poll } = await pollContext(request); const token = (request.headers as Record<string, string | undefined>)['x-participant-token']; const me = await resolveParticipant(database, token, group.id);
    if (!poll.basedOnPollId) return { suggestions: [] };
    const source = await database.client.pollResponse.findUnique({ where: { pollId_participantId: { pollId: poll.basedOnPollId, participantId: me.id } }, include: { intervals: true } });
    if (!source || source.state !== 'CONFIRMED') return { suggestions: [] };
    return { suggestions: source.intervals.map((i) => ({ sourcePollId: poll.basedOnPollId, sourceIntervalId: i.id, localDate: date(i.localDate), startTime: clock(i.startTime), endTime: clock(i.endTime), kind: i.kind, preferenceDirection: i.preferenceDirection })) };
  });
  app.get('/api/groups/:inviteCode/polls/:pollId/results', { schema: { params } }, async (request) => {
    const { group, poll } = await pollContext(request); const [total, confirmed] = await Promise.all([database.client.participant.count({ where: { groupId: group.id } }), database.client.pollResponse.count({ where: { pollId: poll.id, state: 'CONFIRMED' } })]);
    return { participantSummary: { total, confirmed, pending: total - confirmed }, heatmap: [], bestSlots: [] };
  });
}
