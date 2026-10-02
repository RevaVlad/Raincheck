import { after } from 'node:test';
import { loadConfig } from '#config/config';
import { Database } from '#infrastructure/database/database';
import { GroupService } from '#services/group/group.service';
import { IntervalService } from '#services/interval/interval.service';
import { ParticipantService } from '#services/participant/participant.service';
import { PollService } from '#services/poll/poll.service';
import { ResponseService } from '#services/response/response.service';
import { DatabaseProbe } from './database-probe.js';

const database = Database.create(loadConfig());
void after(() => database.close());
const ROLLBACK = Symbol('successful service-test rollback');

export const pollInput = {
  title: 'Team meeting',
  startsOn: '2026-10-06',
  endsOn: '2026-10-12',
  dayStart: '16:00',
  dayEnd: '23:00',
  slotMinutes: 30 as const,
  meetingDurationMinutes: 60,
};
export function services(db: Database) {
  return {
    groups: new GroupService(db),
    intervals: new IntervalService(db),
    participants: new ParticipantService(db),
    polls: new PollService(db),
    responses: new ResponseService(db),
  };
}

export type ServiceTestContext = ReturnType<typeof services> & { probe: DatabaseProbe };

export function sharedDatabase(): Database {
  return database;
}

export async function inTransaction(
  run: (context: ServiceTestContext) => Promise<void>,
): Promise<void> {
  try {
    await database.transaction(async (transaction) => {
      await run({ probe: new DatabaseProbe(transaction), ...services(transaction) });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

export async function persistedResponse(context: ServiceTestContext) {
  const group = await context.groups.create({ name: 'Team' });
  const { participant } = await context.participants.create(group.id, 'Alice');
  const poll = await context.polls.create(group.id, 1, pollInput);
  const response = await context.responses.create(poll.id, participant.id);
  return { group, participant, poll, response };
}
