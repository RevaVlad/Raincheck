import type { AvailabilityInterval } from '#domain/interval/interval';
import type { Poll } from '#domain/poll/poll';
import { pollSlots } from '#shared/time/time-zone';
import type { PollSlot } from '#domain/poll/poll';

const HALF_HOUR = 30 * 60_000;

export interface GhostSuggestion {
  sourcePollId: string;
  sourceIntervalId: string;
  startAt: string;
  endAt: string;
  kind: AvailabilityInterval['kind'];
  preferenceDirection: AvailabilityInterval['preferenceDirection'];
}

export interface HeatmapCell extends PollSlot {
  available: number;
  ifNeeded: number;
  preferred: number;
  unavailable: number;
  averageSoftScore: number;
}

export interface BestSlot extends PollSlot {
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
  timeZone: string,
): GhostSuggestion[] {
  const coverage = sourceCoverage(sourceIntervals, timeZone);
  return pollSlots(target)
    .flatMap(
      (slot) => suggestionForSlot(slot, coverage, currentIntervals, sourcePollId, timeZone) ?? [],
    )
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
}

function sourceCoverage(
  intervals: readonly AvailabilityInterval[],
  timeZone: string,
): Map<string, AvailabilityInterval> {
  const coverage = new Map<string, AvailabilityInterval>();
  for (const interval of intervals) {
    for (
      let start = Date.parse(interval.startAt);
      start < Date.parse(interval.endAt);
      start += HALF_HOUR
    ) {
      const key = localSlotKey(timeZone, new Date(start), new Date(start + HALF_HOUR));
      coverage.set(key, interval);
    }
  }
  return coverage;
}

function suggestionForSlot(
  slot: PollSlot,
  coverage: ReadonlyMap<string, AvailabilityInterval>,
  currentIntervals: readonly AvailabilityInterval[],
  sourcePollId: string,
  timeZone: string,
): GhostSuggestion | null {
  const segments = [];
  for (let start = Date.parse(slot.startAt); start < Date.parse(slot.endAt); start += HALF_HOUR) {
    segments.push(
      coverage.get(localSlotKey(timeZone, new Date(start), new Date(start + HALF_HOUR))),
    );
  }
  const source = segments[0];
  if (!source || segments.some((segment) => segment?.id !== source.id)) return null;
  if (
    currentIntervals.some(
      (interval) => interval.startAt < slot.endAt && interval.endAt > slot.startAt,
    )
  ) {
    return null;
  }
  return {
    sourcePollId,
    sourceIntervalId: source.id,
    ...slot,
    kind: source.kind,
    preferenceDirection: source.preferenceDirection,
  };
}

export function calculateResults(
  poll: Poll,
  total: number,
  responses: readonly ConfirmedResponse[],
) {
  const cells = pollSlots(poll);
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

  const bestSlots = meetingWindows(poll, cells)
    .map(({ slot, cells: window }) => summarizeCandidate(slot, window, byParticipant))
    .sort(
      (left, right) =>
        right.available - left.available ||
        left.ifNeeded - right.ifNeeded ||
        right.averageSoftScore - left.averageSoftScore ||
        left.startAt.localeCompare(right.startAt),
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

function meetingWindows(poll: Poll, slots: PollSlot[]) {
  const length = poll.meetingDurationMinutes / poll.slotMinutes;
  return slots.flatMap((slot, index) => {
    const cells = slots.slice(index, index + length);
    const lastCell = cells.at(-1);
    if (
      cells.length !== length ||
      !lastCell ||
      cells.some((cell, offset) => offset > 0 && cells[offset - 1]?.endAt !== cell.startAt)
    ) {
      return [];
    }
    return [{ slot: { startAt: slot.startAt, endAt: lastCell.endAt }, cells }];
  });
}

function summarizeCell(
  cell: PollSlot,
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
  candidate: PollSlot,
  cells: readonly PollSlot[],
  participants: ReadonlyMap<string, readonly AvailabilityInterval[]>,
): BestSlot {
  const states = [...participants.values()].map((intervals) => {
    const covered = cells.map((cell) => classify(cell, intervals));
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

function classify(cell: PollSlot, intervals: readonly AvailabilityInterval[]): CellState {
  const interval = intervals.find(
    (value) => value.startAt <= cell.startAt && value.endAt >= cell.endAt,
  );
  if (!interval) return { availability: 'AVAILABLE', preferred: false, softScore: 0.5 };
  if (interval.kind === 'UNAVAILABLE')
    return { availability: 'UNAVAILABLE', preferred: false, softScore: 0 };
  if (interval.kind === 'IF_NEEDED')
    return { availability: 'IF_NEEDED', preferred: false, softScore: 0.25 };
  return { availability: 'AVAILABLE', preferred: true, softScore: preferenceScore(cell, interval) };
}

function preferenceScore(cell: PollSlot, interval: AvailabilityInterval): number {
  if (interval.preferenceDirection === 'FLAT') return 1;
  const start = Date.parse(interval.startAt);
  const ratio =
    ((Date.parse(cell.startAt) + Date.parse(cell.endAt)) / 2 - start) /
    (Date.parse(interval.endAt) - start);
  return interval.preferenceDirection === 'EARLIER' ? 1 - ratio * 0.25 : 0.75 + ratio * 0.25;
}

function localSlotKey(timeZone: string, start: Date, end: Date): string {
  const startLocal = localDateTime(timeZone, start);
  const endLocal = localDateTime(timeZone, end);
  const startKey = `${isoWeekday(startLocal.date)}:${startLocal.minute}`;
  const endKey = `${isoWeekday(endLocal.date)}:${endLocal.minute}`;
  return `${startKey}:${endKey}`;
}

function localDateTime(timeZone: string, instant: Date): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minute: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

function isoWeekday(date: string): number {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday || 7;
}

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
