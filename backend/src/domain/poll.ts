import { randomUUID } from 'node:crypto';

export type SlotMinutes = 30 | 60;

interface PollFields {
  id: string;
  groupId: string;
  sequenceNo: number;
  title: string | null;
  startsOn: string;
  endsOn: string;
  dayStart: string;
  dayEnd: string;
  slotMinutes: SlotMinutes;
  meetingDurationMinutes: number;
  basedOnPollId: string | null;
  createdAt: Date;
}

export type Poll = PollFields & (
  | { status: 'OPEN'; closedAt: null }
  | { status: 'CLOSED'; closedAt: Date }
);

export interface PollInput {
  title?: string | null;
  startsOn: string;
  endsOn: string;
  dayStart: string;
  dayEnd: string;
  slotMinutes: SlotMinutes;
  meetingDurationMinutes: number;
}

export function calendarDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError('Invalid calendar date');
  }
  const [year, month, day] = value.split('-').map(Number);
  const epoch = Date.UTC(year!, month! - 1, day!);
  if (new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new RangeError('Invalid calendar date');
  }
  return epoch;
}

export function timeMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new RangeError('Invalid local time');
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

export function createPoll(
  groupId: string,
  sequenceNo: number,
  input: PollInput,
  basedOnPollId: string | null = null,
  now = new Date(),
): Poll {
  if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
    throw new RangeError('Poll sequence number must be positive');
  }
  const startsOn = calendarDate(input.startsOn);
  const endsOn = calendarDate(input.endsOn);
  const days = (endsOn - startsOn) / 86_400_000 + 1;
  if (days < 1 || days > 7) {
    throw new RangeError('Poll must span one to seven days');
  }
  const dayStart = timeMinutes(input.dayStart);
  const dayEnd = timeMinutes(input.dayEnd);
  if (dayEnd <= dayStart) {
    throw new RangeError('Poll day end must follow day start');
  }
  if (input.slotMinutes !== 30 && input.slotMinutes !== 60) {
    throw new RangeError('Poll slot must be 30 or 60 minutes');
  }
  if (!Number.isInteger(input.meetingDurationMinutes)
    || input.meetingDurationMinutes < 30
    || input.meetingDurationMinutes > 240
    || input.meetingDurationMinutes % input.slotMinutes !== 0) {
    throw new RangeError('Meeting duration must be 30 to 240 minutes and a multiple of slot size');
  }
  if (input.meetingDurationMinutes > dayEnd - dayStart) {
    throw new RangeError('Meeting duration exceeds the daily window');
  }
  const title = input.title?.trim() || null;
  if (title && Array.from(title).length > 160) {
    throw new RangeError('Poll title must be at most 160 characters');
  }
  return {
    id: randomUUID(), groupId, sequenceNo, title,
    startsOn: input.startsOn, endsOn: input.endsOn,
    dayStart: input.dayStart, dayEnd: input.dayEnd,
    slotMinutes: input.slotMinutes,
    meetingDurationMinutes: input.meetingDurationMinutes,
    status: 'OPEN', basedOnPollId, createdAt: now, closedAt: null,
  };
}

export function closePoll(poll: Poll, now = new Date()): Poll {
  ensurePollOpen(poll);
  return { ...poll, status: 'CLOSED', closedAt: now };
}

export function ensurePollOpen(poll: Pick<Poll, 'status'>): void {
  if (poll.status !== 'OPEN') {
    throw new Error('Closed poll responses cannot be edited');
  }
}
