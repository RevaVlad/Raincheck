import type { IntervalInput, PollSlot } from '@shared/api';
import type { AvailabilityKind } from '../model/availability.types';

export type AvailabilityCells = Record<string, AvailabilityKind>;
export type SerializedAvailabilityInterval = IntervalInput;

export function expandIntervalsToCells(
  intervals: readonly IntervalInput[],
  slots: readonly PollSlot[],
): AvailabilityCells {
  return Object.fromEntries(
    slots.flatMap((slot) => {
      const interval = intervals.find(
        (item) => item.startAt <= slot.startAt && item.endAt >= slot.endAt,
      );
      return interval ? [[slot.startAt, interval.kind]] : [];
    }),
  );
}

export function compressCellsToIntervals(
  cells: Readonly<AvailabilityCells>,
  slots: readonly PollSlot[],
): SerializedAvailabilityInterval[] {
  const intervals: SerializedAvailabilityInterval[] = [];
  for (const slot of slots) {
    const kind = cells[slot.startAt];
    if (!kind) continue;
    appendSlot(intervals, slot, kind);
  }
  return intervals;
}

function appendSlot(
  intervals: SerializedAvailabilityInterval[],
  slot: PollSlot,
  kind: AvailabilityKind,
): void {
  const previous = intervals.at(-1);
  if (previous?.endAt === slot.startAt && previous.kind === kind) {
    previous.endAt = slot.endAt;
    return;
  }
  intervals.push({
    startAt: slot.startAt,
    endAt: slot.endAt,
    kind,
    preferenceDirection: kind === 'PREFERRED' ? 'FLAT' : null,
  });
}
