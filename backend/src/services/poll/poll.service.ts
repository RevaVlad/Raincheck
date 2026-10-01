import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Poll, PollInput } from '#entities/poll';
import { ensurePollOpen, validatePoll } from '#entities/poll.validation';
import { POLL_STATUS } from '#shared/constants';

export async function createPoll(
  db: PoolClient,
  groupId: string,
  sequenceNo: number,
  input: PollInput,
  basedOnPollId: string | null = null,
  now = new Date(),
): Promise<Poll> {
  const title = validatePoll(sequenceNo, input);
  const poll: Poll = {
    id: randomUUID(), groupId, sequenceNo, title,
    startsOn: input.startsOn, endsOn: input.endsOn,
    dayStart: input.dayStart, dayEnd: input.dayEnd,
    slotMinutes: input.slotMinutes,
    meetingDurationMinutes: input.meetingDurationMinutes,
    status: POLL_STATUS.OPEN, basedOnPollId, createdAt: now, closedAt: null,
  };
  await db.query(
    `INSERT INTO polls
       (id, group_id, sequence_no, title, starts_on, ends_on, day_start, day_end,
        slot_minutes, meeting_duration_minutes, status, based_on_poll_id, created_at, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [poll.id, poll.groupId, poll.sequenceNo, poll.title, poll.startsOn, poll.endsOn,
      poll.dayStart, poll.dayEnd, poll.slotMinutes, poll.meetingDurationMinutes,
      poll.status, poll.basedOnPollId, poll.createdAt, poll.closedAt],
  );
  return poll;
}

export async function closePoll(db: PoolClient, poll: Poll, now = new Date()): Promise<Poll> {
  ensurePollOpen(poll.status);
  const result = await db.query(
    `UPDATE polls SET status = $2, closed_at = $3 WHERE id = $1 AND status = $4`,
    [poll.id, POLL_STATUS.CLOSED, now, POLL_STATUS.OPEN],
  );
  if (result.rowCount !== 1) throw new Error('Poll is already closed');
  return { ...poll, status: POLL_STATUS.CLOSED, closedAt: now };
}
