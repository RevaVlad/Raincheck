import type { POLL_STATUS } from '#shared/constants';

export type SlotMinutes = 30 | 60;
export type PollStatus = typeof POLL_STATUS[keyof typeof POLL_STATUS];

/** Date-only and clock fields are interpreted in UTC. */
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
