import { LIMITS, POLL_STATUS } from '#shared/constants';
import { daysInclusive, utcTimeMinutes } from '#shared/utils/time';
import type { PollInput, PollStatus } from './poll.js';

export function validatePoll(sequenceNo: number, input: PollInput): string | null {
  if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
    throw new RangeError('Poll sequence number must be positive');
  }
  const days = daysInclusive(input.startsOn, input.endsOn);
  if (days < 1 || days > LIMITS.POLL_DAYS) {
    throw new RangeError('Poll must span one to seven days');
  }
  const start = utcTimeMinutes(input.dayStart);
  const end = utcTimeMinutes(input.dayEnd);
  if (end <= start) throw new RangeError('Poll day end must follow day start');
  if (input.slotMinutes !== 30 && input.slotMinutes !== 60) {
    throw new RangeError('Poll slot must be 30 or 60 minutes');
  }
  const duration = input.meetingDurationMinutes;
  if (!Number.isInteger(duration) || duration < 30 || duration > LIMITS.MEETING_MINUTES ||
      duration % input.slotMinutes !== 0) {
    throw new RangeError('Meeting duration must be 30 to 240 minutes and a multiple of slot size');
  }
  if (duration > end - start) throw new RangeError('Meeting duration exceeds the daily window');
  const title = input.title?.trim() || null;
  if (title && Array.from(title).length > LIMITS.POLL_TITLE) {
    throw new RangeError(`Poll title must be at most ${LIMITS.POLL_TITLE} characters`);
  }
  return title;
}

export function ensurePollOpen(status: PollStatus): void {
  if (status !== POLL_STATUS.OPEN) throw new Error('Closed poll responses cannot be edited');
}
