import { after } from 'node:test';
import type { EntityManager } from '@mikro-orm/postgresql';
import { loadConfig } from '#config/config';
import { createOrm } from '#infrastructure/database/create-orm';
import { MikroGroupService } from '#services/group/group.service';
import { MikroIntervalService } from '#services/interval/interval.service';
import { MikroParticipantService } from '#services/participant/participant.service';
import { MikroPollService } from '#services/poll/poll.service';
import { MikroResponseService } from '#services/response/response.service';

const orm = await createOrm(loadConfig());
after(async () => orm.close(true));

export const pollInput = {
  title: 'Team meeting', startsOn: '2026-10-06', endsOn: '2026-10-12',
  dayStart: '16:00', dayEnd: '23:00', slotMinutes: 30 as const,
  meetingDurationMinutes: 60,
};

export function services(em: EntityManager) {
  return {
    groups: new MikroGroupService(em),
    intervals: new MikroIntervalService(em),
    participants: new MikroParticipantService(em),
    polls: new MikroPollService(em),
    responses: new MikroResponseService(em),
  };
}

export async function inTransaction(
  run: (context: ReturnType<typeof services> & { em: EntityManager }) => Promise<void>,
): Promise<void> {
  const em = orm.em.fork();
  await em.begin();
  try {
    await run({ em, ...services(em) });
  } finally {
    await em.rollback();
  }
}

export async function persistedResponse(context: ReturnType<typeof services>) {
  const group = await context.groups.create({ name: 'Team' });
  const { participant } = await context.participants.create(group.id, 'Alice');
  const poll = await context.polls.create(group.id, 1, pollInput);
  const response = await context.responses.create(poll.id, participant.id);
  return { group, participant, poll, response };
}
