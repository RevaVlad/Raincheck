import { LIMITS, POLL_STATUS } from '#shared/constants';
import { daysInclusive, utcTimeMinutes } from '#shared/time/utc';
import type { PollInput, PollStatus, ValidPollInput } from './poll.js';

export function validatePoll(sequenceNo: number, input: PollInput): ValidPollInput {
  validateSequenceNumber(sequenceNo);
  validateDateRange(input.startsOn, input.endsOn);
  const windowMinutes = validateDailyWindow(input.dayStart, input.dayEnd);
  validateSlotMinutes(input.slotMinutes);
  validateMeetingDuration(input, windowMinutes);
  return { ...input, title: normalizeTitle(input.title) };
}

export function ensurePollOpen(status: PollStatus): void {
  if (status !== POLL_STATUS.OPEN) throw new Error('Closed poll responses cannot be edited');
}

function validateSequenceNumber(sequenceNo: number): void {
  if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
    throw new RangeError('Poll sequence number must be positive');
  }
}

function validateDateRange(startsOn: string, endsOn: string): void {
  const days = daysInclusive(startsOn, endsOn);
  if (days < 1 || days > LIMITS.POLL_DAYS) {
    throw new RangeError('Poll must span one to seven days');
  }
}

function validateDailyWindow(dayStart: string, dayEnd: string): number {
  const minutes = utcTimeMinutes(dayEnd) - utcTimeMinutes(dayStart);
  if (minutes <= 0) throw new RangeError('Poll day end must follow day start');
  return minutes;
}

function validateSlotMinutes(slotMinutes: number): void {
  if (slotMinutes !== 30 && slotMinutes !== 60) {
    throw new RangeError('Poll slot must be 30 or 60 minutes');
  }
}

function validateMeetingDuration(input: PollInput, windowMinutes: number): void {
  const duration = input.meetingDurationMinutes;
  const invalidDuration = !Number.isInteger(duration) || duration < 30 ||
    duration > LIMITS.MEETING_MINUTES || duration % input.slotMinutes !== 0;
  if (invalidDuration) {
    throw new RangeError('Meeting duration must be 30 to 240 minutes and a multiple of slot size');
  }
  if (duration > windowMinutes) throw new RangeError('Meeting duration exceeds the daily window');
}

function normalizeTitle(title: string | null | undefined): string | null {
  const normalized = title?.trim() || null;
  if (normalized && Array.from(normalized).length > LIMITS.POLL_TITLE) {
    throw new RangeError(`Poll title must be at most ${LIMITS.POLL_TITLE} characters`);
  }
  return normalized;
}
