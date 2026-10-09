import type { AvailabilityInterval, PreferenceDirection } from '#domain/interval/interval';
import type { Participant } from '#domain/participant/participant';
import { validateAvatarColor } from '#domain/participant/participant.validation';
import { validateSlotMinutes } from '#domain/poll/poll.validation';
import type { Poll } from '#domain/poll/poll';
import type { PollResponse } from '#domain/response/response';
import { utcCalendarDate, utcTimeMinutes } from '#shared/time/utc';
import type {
  Participant as ParticipantRecord,
  Poll as PollRecord,
  PollResponse as ResponseRecord,
  AvailabilityInterval as IntervalRecord,
} from '../../generated/prisma/client.js';

export function dateToPrisma(value: string): Date {
  return new Date(utcCalendarDate(value));
}

export function timeToPrisma(value: string): Date {
  return new Date(utcTimeMinutes(value) * 60_000);
}

export function dateFromPrisma(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function timeFromPrisma(value: Date): string {
  return value.toISOString().slice(11, 16);
}

export function toParticipant(record: ParticipantRecord): Participant {
  return { ...record, avatarColor: validateAvatarColor(record.avatarColor) };
}

export function toPoll(record: PollRecord): Poll {
  const fields = {
    ...record,
    startsOn: dateFromPrisma(record.startsOn),
    endsOn: dateFromPrisma(record.endsOn),
    dayStart: timeFromPrisma(record.dayStart),
    dayEnd: timeFromPrisma(record.dayEnd),
    slotMinutes: validateSlotMinutes(record.slotMinutes),
  };
  if (record.status === 'OPEN') return { ...fields, status: 'OPEN', closedAt: null };
  if (record.status === 'CLOSED') {
    if (!record.closedAt) throw new Error('Closed poll is missing closed_at');
    return { ...fields, status: 'CLOSED', closedAt: record.closedAt };
  }
  throw new Error('Poll has an invalid status');
}

export function toResponse(record: ResponseRecord): PollResponse {
  if (record.state === 'DRAFT') return { ...record, state: 'DRAFT', confirmedAt: null };
  if (record.state !== 'CONFIRMED') throw new Error('Response has an invalid state');
  if (!record.confirmedAt) throw new Error('Confirmed response is missing confirmed_at');
  return { ...record, state: 'CONFIRMED', confirmedAt: record.confirmedAt };
}

export function toInterval(record: IntervalRecord): AvailabilityInterval {
  const fields = {
    ...record,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt.toISOString(),
  };
  if (record.kind === 'PREFERRED') {
    const direction = record.preferenceDirection;
    requirePreferenceDirection(direction);
    return { ...fields, kind: 'PREFERRED', preferenceDirection: direction };
  }
  if (record.kind === 'UNAVAILABLE' || record.kind === 'IF_NEEDED') {
    return { ...fields, kind: record.kind, preferenceDirection: null };
  }
  throw new Error('Interval has an invalid kind');
}

function requirePreferenceDirection(value: string | null): asserts value is PreferenceDirection {
  if (!value) throw new Error('Preferred interval is missing a direction');
  if (value !== 'EARLIER' && value !== 'FLAT' && value !== 'LATER') {
    throw new Error('Preferred interval has an invalid direction');
  }
}
