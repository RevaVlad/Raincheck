import type { Poll } from '#domain/poll/poll';
import { pollSlots } from '#shared/time/time-zone';

export function toPollDto(poll: Poll, includeSlots = false) {
  return {
    id: poll.id,
    sequenceNo: poll.sequenceNo,
    title: poll.title,
    startsOn: poll.startsOn,
    endsOn: poll.endsOn,
    dayStart: poll.dayStart,
    dayEnd: poll.dayEnd,
    slotMinutes: poll.slotMinutes,
    meetingDurationMinutes: poll.meetingDurationMinutes,
    timeZone: poll.timeZone,
    status: poll.status,
    basedOnPollId: poll.basedOnPollId,
    createdAt: poll.createdAt.toISOString(),
    closedAt: poll.closedAt?.toISOString() ?? null,
    ...(includeSlots ? { slots: pollSlots(poll) } : {}),
  };
}
