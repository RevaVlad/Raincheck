import type { Group } from '#domain/group/group';
import type { AvailabilityInterval, PreferenceDirection } from '#domain/interval/interval';
import type { AvatarColor, Participant } from '#domain/participant/participant';
import type { Poll, SlotMinutes } from '#domain/poll/poll';
import type { PollResponse } from '#domain/response/response';
import { utcCalendarDate, utcTimeMinutes } from '#shared/time/utc';
import type {
  Group as GroupRecord,
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

export function toGroup(record: GroupRecord): Group {
  return record;
}

export function toParticipant(record: ParticipantRecord): Participant {
  return { ...record, avatarColor: record.avatarColor as AvatarColor };
}

export function toPoll(record: PollRecord): Poll {
  const fields = {
    ...record,
    startsOn: dateFromPrisma(record.startsOn),
    endsOn: dateFromPrisma(record.endsOn),
    dayStart: timeFromPrisma(record.dayStart),
    dayEnd: timeFromPrisma(record.dayEnd),
    slotMinutes: record.slotMinutes as SlotMinutes,
    timeZone: record.timeZone,
  };
  if (record.status === 'OPEN') return { ...fields, status: 'OPEN', closedAt: null };
  if (!record.closedAt) throw new Error('Closed poll is missing closed_at');
  return { ...fields, status: 'CLOSED', closedAt: record.closedAt };
}

export function toResponse(record: ResponseRecord): PollResponse {
  if (record.state === 'DRAFT') return { ...record, state: 'DRAFT', confirmedAt: null };
  if (!record.confirmedAt) throw new Error('Confirmed response is missing confirmed_at');
  return { ...record, state: 'CONFIRMED', confirmedAt: record.confirmedAt };
}

export function toInterval(record: IntervalRecord): AvailabilityInterval {
  const fields = {
    ...record,
    startAt: record.startAt.toISOString(),
    endAt: record.endAt.toISOString(),
  };
  if (record.kind !== 'PREFERRED') {
    return {
      ...fields,
      kind: record.kind as 'UNAVAILABLE' | 'IF_NEEDED',
      preferenceDirection: null,
    };
  }
  if (!record.preferenceDirection) throw new Error('Preferred interval is missing a direction');
  return {
    ...fields,
    kind: 'PREFERRED',
    preferenceDirection: record.preferenceDirection as PreferenceDirection,
  };
}
