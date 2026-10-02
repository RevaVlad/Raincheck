import type { AvailabilityInterval } from '#domain/interval/interval';
import type { Poll } from '#domain/poll/poll';
import { utcCalendarDate, utcTimeMinutes } from '#shared/time/utc';

export interface GhostSuggestion {
  sourcePollId: string;
  sourceIntervalId: string;
  localDate: string;
  startTime: string;
  endTime: string;
  kind: AvailabilityInterval['kind'];
  preferenceDirection: AvailabilityInterval['preferenceDirection'];
}
export interface HeatmapCell {
  localDate: string;
  startTime: string;
  endTime: string;
  available: number;
  ifNeeded: number;
  preferred: number;
  unavailable: number;
  averageSoftScore: number;
}
export interface BestSlot {
  localDate: string;
  startTime: string;
  endTime: string;
  available: number;
  ifNeeded: number;
  averageSoftScore: number;
  stars: number;
}
interface ConfirmedResponse {
  participantId: string;
  intervals: readonly AvailabilityInterval[];
}
interface CellState {
  availability: 'UNAVAILABLE' | 'IF_NEEDED' | 'AVAILABLE';
  preferred: boolean;
  softScore: number;
}

export function buildSuggestions(
  target: Poll,
  sourcePollId: string,
  sourceIntervals: readonly AvailabilityInterval[],
  currentIntervals: readonly AvailabilityInterval[],
): GhostSuggestion[] {
  const suggestions = sourceIntervals.flatMap((interval) =>
    targetDates(target, interval.localDate).flatMap((localDate) => {
      const clipped = fitToWindow(interval.startTime, interval.endTime, target);
      if (!clipped) return [];
      return subtract(
        {
          sourcePollId,
          sourceIntervalId: interval.id,
          localDate,
          ...clipped,
          kind: interval.kind,
          preferenceDirection: interval.preferenceDirection,
        },
        currentIntervals,
      );
    }),
  );
  return suggestions.sort(compareDateTime);
}

export function calculateResults(
  poll: Poll,
  total: number,
  responses: readonly ConfirmedResponse[],
) {
  const cells = gridCells(poll);
  const byParticipant = new Map(
    responses.map((response) => [response.participantId, response.intervals]),
  );
  const heatmap = cells.map((cell) => summarizeCell(cell, byParticipant));
  if (byParticipant.size === 0)
    return {
      participantSummary: { total, confirmed: 0, pending: total },
      heatmap,
      bestSlots: [] as BestSlot[],
    };
  const bestSlots = candidateCells(poll)
    .map((candidate) => summarizeCandidate(candidate, byParticipant, poll.slotMinutes))
    .sort(
      (left, right) =>
        right.available - left.available ||
        left.ifNeeded - right.ifNeeded ||
        right.averageSoftScore - left.averageSoftScore ||
        compareDateTime(left, right),
    )
    .slice(0, 3);
  return {
    participantSummary: {
      total,
      confirmed: byParticipant.size,
      pending: total - byParticipant.size,
    },
    heatmap,
    bestSlots,
  };
}

function targetDates(poll: Poll, sourceDate: string): string[] {
  const weekday = isoWeekday(sourceDate);
  return dates(poll.startsOn, poll.endsOn).filter((date) => isoWeekday(date) === weekday);
}
function subtract(
  suggestion: GhostSuggestion,
  intervals: readonly AvailabilityInterval[],
): GhostSuggestion[] {
  let fragments = [suggestion];
  for (const interval of intervals)
    if (interval.localDate === suggestion.localDate)
      fragments = fragments.flatMap((fragment) => subtractOne(fragment, interval));
  return fragments;
}
function subtractOne(fragment: GhostSuggestion, interval: AvailabilityInterval): GhostSuggestion[] {
  const start = utcTimeMinutes(fragment.startTime);
  const end = utcTimeMinutes(fragment.endTime);
  const cutStart = utcTimeMinutes(interval.startTime);
  const cutEnd = utcTimeMinutes(interval.endTime);
  if (cutEnd <= start || cutStart >= end) return [fragment];
  return [
    cutStart > start ? { ...fragment, endTime: clock(cutStart) } : null,
    cutEnd < end ? { ...fragment, startTime: clock(cutEnd) } : null,
  ].filter((value): value is GhostSuggestion => value !== null);
}
function fitToWindow(
  startTime: string,
  endTime: string,
  poll: Poll,
): Pick<GhostSuggestion, 'startTime' | 'endTime'> | null {
  const dayStart = utcTimeMinutes(poll.dayStart);
  const dayEnd = utcTimeMinutes(poll.dayEnd);
  const start = Math.max(utcTimeMinutes(startTime), dayStart);
  const end = Math.min(utcTimeMinutes(endTime), dayEnd);
  const roundedStart =
    dayStart + Math.ceil((start - dayStart) / poll.slotMinutes) * poll.slotMinutes;
  const roundedEnd = dayStart + Math.floor((end - dayStart) / poll.slotMinutes) * poll.slotMinutes;
  return roundedStart < roundedEnd
    ? { startTime: clock(roundedStart), endTime: clock(roundedEnd) }
    : null;
}
function gridCells(poll: Poll): Array<Pick<HeatmapCell, 'localDate' | 'startTime' | 'endTime'>> {
  return dates(poll.startsOn, poll.endsOn).flatMap((localDate) =>
    timeCells(
      localDate,
      utcTimeMinutes(poll.dayStart),
      utcTimeMinutes(poll.dayEnd),
      poll.slotMinutes,
    ),
  );
}
function candidateCells(poll: Poll): Array<Pick<BestSlot, 'localDate' | 'startTime' | 'endTime'>> {
  return dates(poll.startsOn, poll.endsOn).flatMap((localDate) =>
    timeCells(
      localDate,
      utcTimeMinutes(poll.dayStart),
      utcTimeMinutes(poll.dayEnd),
      poll.slotMinutes,
      poll.meetingDurationMinutes,
    ),
  );
}
function timeCells(
  localDate: string,
  start: number,
  end: number,
  slotMinutes: number,
  duration = slotMinutes,
) {
  const cells = [];
  for (let minute = start; minute + duration <= end; minute += slotMinutes)
    cells.push({ localDate, startTime: clock(minute), endTime: clock(minute + duration) });
  return cells;
}
function summarizeCell(
  cell: Pick<HeatmapCell, 'localDate' | 'startTime' | 'endTime'>,
  participants: ReadonlyMap<string, readonly AvailabilityInterval[]>,
): HeatmapCell {
  const states = [...participants.values()].map((intervals) => classify(cell, intervals));
  return {
    ...cell,
    available: states.filter((state) => state.availability !== 'UNAVAILABLE').length,
    ifNeeded: states.filter((state) => state.availability === 'IF_NEEDED').length,
    preferred: states.filter((state) => state.preferred).length,
    unavailable: states.filter((state) => state.availability === 'UNAVAILABLE').length,
    averageSoftScore: average(states.map((state) => state.softScore)),
  };
}
function summarizeCandidate(
  candidate: Pick<BestSlot, 'localDate' | 'startTime' | 'endTime'>,
  participants: ReadonlyMap<string, readonly AvailabilityInterval[]>,
  slotMinutes: number,
): BestSlot {
  const states = [...participants.values()].map((intervals) => {
    const covered = timeCells(
      candidate.localDate,
      utcTimeMinutes(candidate.startTime),
      utcTimeMinutes(candidate.endTime) - slotMinutes,
      slotMinutes,
    ).map((cell) => classify(cell, intervals));
    if (covered.some((cell) => cell.availability === 'UNAVAILABLE'))
      return { availability: 'UNAVAILABLE' as const, softScore: 0 };
    if (covered.some((cell) => cell.availability === 'IF_NEEDED'))
      return {
        availability: 'IF_NEEDED' as const,
        softScore: average(covered.map((cell) => cell.softScore)),
      };
    return {
      availability: 'AVAILABLE' as const,
      softScore: average(covered.map((cell) => cell.softScore)),
    };
  });
  const averageSoftScore = average(states.map((state) => state.softScore));
  return {
    ...candidate,
    available: states.filter((state) => state.availability !== 'UNAVAILABLE').length,
    ifNeeded: states.filter((state) => state.availability === 'IF_NEEDED').length,
    averageSoftScore,
    stars: Math.max(1, Math.min(5, Math.round(1 + averageSoftScore * 4))),
  };
}
function classify(
  cell: Pick<HeatmapCell, 'localDate' | 'startTime' | 'endTime'>,
  intervals: readonly AvailabilityInterval[],
): CellState {
  const interval = intervals.find(
    (value) =>
      value.localDate === cell.localDate &&
      utcTimeMinutes(value.startTime) <= utcTimeMinutes(cell.startTime) &&
      utcTimeMinutes(value.endTime) >= utcTimeMinutes(cell.endTime),
  );
  if (!interval) return { availability: 'AVAILABLE', preferred: false, softScore: 0.5 };
  if (interval.kind === 'UNAVAILABLE')
    return { availability: 'UNAVAILABLE', preferred: false, softScore: 0 };
  if (interval.kind === 'IF_NEEDED')
    return { availability: 'IF_NEEDED', preferred: false, softScore: 0.25 };
  return { availability: 'AVAILABLE', preferred: true, softScore: preferenceScore(cell, interval) };
}
function preferenceScore(
  cell: Pick<HeatmapCell, 'startTime' | 'endTime'>,
  interval: AvailabilityInterval,
): number {
  if (interval.preferenceDirection === 'FLAT') return 1;
  const start = utcTimeMinutes(interval.startTime);
  const ratio =
    ((utcTimeMinutes(cell.startTime) + utcTimeMinutes(cell.endTime)) / 2 - start) /
    (utcTimeMinutes(interval.endTime) - start);
  return interval.preferenceDirection === 'EARLIER' ? 1 - ratio * 0.25 : 0.75 + ratio * 0.25;
}
function dates(start: string, end: string): string[] {
  const values = [];
  for (
    let value = utcCalendarDate(start), limit = utcCalendarDate(end);
    value <= limit;
    value += 86_400_000
  )
    values.push(new Date(value).toISOString().slice(0, 10));
  return values;
}
function isoWeekday(value: string): number {
  return new Date(utcCalendarDate(value)).getUTCDay() || 7;
}
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function compareDateTime(
  left: { localDate: string; startTime: string },
  right: { localDate: string; startTime: string },
): number {
  return (
    left.localDate.localeCompare(right.localDate) || left.startTime.localeCompare(right.startTime)
  );
}
