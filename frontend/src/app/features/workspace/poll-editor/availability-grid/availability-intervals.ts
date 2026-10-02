import type { AvailabilityKind } from '../poll-editor.service';

export interface AvailabilityIntervalInput {
  localDate: string;
  startTime: string;
  endTime: string;
  kind: AvailabilityKind;
}

export type AvailabilityCells = Record<string, AvailabilityKind>;

export interface SerializedAvailabilityInterval extends AvailabilityIntervalInput {
  preferenceDirection: 'FLAT' | null;
}

export function availabilityCellKey(localDate: string, startTime: string): string {
  return `${localDate}|${startTime}`;
}

export function expandIntervalsToCells(
  intervals: readonly AvailabilityIntervalInput[],
  slotMinutes = 30,
): AvailabilityCells {
  const cells: AvailabilityCells = {};

  for (const interval of intervals) {
    const start = toMinutes(interval.startTime);
    const end = toMinutes(interval.endTime);

    for (let minute = start; minute < end; minute += slotMinutes) {
      cells[availabilityCellKey(interval.localDate, toTime(minute))] = interval.kind;
    }
  }

  return cells;
}

export function compressCellsToIntervals(
  cells: Readonly<AvailabilityCells>,
  slotMinutes = 30,
): SerializedAvailabilityInterval[] {
  const entries = Object.entries(cells)
    .map(([key, kind]) => {
      const [localDate, startTime] = key.split('|');
      return { localDate, startTime, kind };
    })
    .sort((left, right) =>
      left.localDate === right.localDate
        ? left.startTime.localeCompare(right.startTime)
        : left.localDate.localeCompare(right.localDate),
    );

  const intervals: SerializedAvailabilityInterval[] = [];

  for (const cell of entries) {
    const previous = intervals.at(-1);
    if (
      previous &&
      previous.localDate === cell.localDate &&
      previous.kind === cell.kind &&
      toMinutes(previous.endTime) === toMinutes(cell.startTime)
    ) {
      previous.endTime = toTime(toMinutes(cell.startTime) + slotMinutes);
    } else {
      intervals.push({
        ...cell,
        endTime: toTime(toMinutes(cell.startTime) + slotMinutes),
        preferenceDirection: cell.kind === 'PREFERRED' ? 'FLAT' : null,
      });
    }
  }

  return intervals;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
