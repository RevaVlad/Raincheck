import type { FastifyInstance } from 'fastify';
import type { PrismaDatabase } from '#infrastructure/database/prisma-database';
import { toPoll } from '#infrastructure/database/prisma-records';
import { GroupService } from '#services/group/group.service';
import { PollService } from '#services/poll/poll.service';
import { AppError } from './errors.js';
import { inviteCodeParams } from './schemas.js';
import { resolveParticipant } from './participant-identity.js';

const pollBody = { type: 'object', additionalProperties: false, required: ['startsOn', 'endsOn', 'dayStart', 'dayEnd', 'slotMinutes', 'meetingDurationMinutes'], properties: { title: { type: ['string', 'null'], maxLength: 160 }, startsOn: { type: 'string' }, endsOn: { type: 'string' }, dayStart: { type: 'string' }, dayEnd: { type: 'string' }, slotMinutes: { type: 'integer', enum: [30, 60] }, meetingDurationMinutes: { type: 'integer', minimum: 30, maximum: 240 } } } as const;
const pollParams = { type: 'object', additionalProperties: false, required: ['inviteCode', 'pollId'], properties: { ...inviteCodeParams.properties, pollId: { type: 'string' } } } as const;
const dto = (poll: ReturnType<typeof toPoll>) => ({ id: poll.id, sequenceNo: poll.sequenceNo, title: poll.title, startsOn: poll.startsOn, endsOn: poll.endsOn, dayStart: poll.dayStart, dayEnd: poll.dayEnd, slotMinutes: poll.slotMinutes, meetingDurationMinutes: poll.meetingDurationMinutes, status: poll.status, basedOnPollId: poll.basedOnPollId, createdAt: poll.createdAt.toISOString(), closedAt: poll.closedAt?.toISOString() ?? null });
const code = (params: unknown) => (params as { inviteCode: string }).inviteCode;

export function registerPollRoutes(app: FastifyInstance, database: PrismaDatabase): void {
  app.get('/api/groups/:inviteCode/polls', { schema: { params: inviteCodeParams } }, async (request) => {
    const group = await new GroupService(database).findByInviteCode(code(request.params));
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
    return { polls: (await new PollService(database).list(group.id)).map(dto) };
  });
  app.get('/api/groups/:inviteCode/polls/:pollId', { schema: { params: pollParams } }, async (request) => {
    const group = await new GroupService(database).findByInviteCode(code(request.params));
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
    const poll = await new PollService(database).findInGroup(group.id, (request.params as { pollId: string }).pollId);
    if (!poll) throw new AppError('POLL_NOT_FOUND', 404, 'Poll not found');
    const responses = await database.client.pollResponse.findMany({ where: { pollId: poll.id }, include: { participant: { select: { id: true, displayName: true } } } });
    return { poll: dto(poll), participantStates: responses.map((response) => ({ participant: response.participant, state: response.state })) };
  });
  app.post('/api/groups/:inviteCode/polls', { schema: { params: inviteCodeParams, body: pollBody } }, async (request, reply) => {
    const group = await new GroupService(database).findByInviteCode(code(request.params));
    if (!group) throw new AppError('GROUP_NOT_FOUND', 404, 'Group not found');
    await resolveParticipant(database, (request.headers as Record<string, string | undefined>)['x-participant-token'], group.id);
    try {
      return reply.code(201).send({ poll: dto(await new PollService(database).createNext(group.id, request.body as Parameters<PollService['createNext']>[1])) });
    } catch (error) {
      if (error instanceof RangeError) throw new AppError('INVALID_SCHEDULE', 422, error.message);
      if (error instanceof Error && error.message === 'Poll state conflict') throw new AppError('POLL_STATE_CONFLICT', 409, error.message);
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new AppError('POLL_STATE_CONFLICT', 409, 'Poll state conflict');
      throw error;
    }
  });
}
