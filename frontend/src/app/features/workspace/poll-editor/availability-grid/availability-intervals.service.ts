import { Injectable, signal } from '@angular/core';

import type { AvailabilityBrush, AvailabilityKind } from '../poll-editor.service';
import {
  availabilityCellKey,
  compressCellsToIntervals,
  expandIntervalsToCells,
  type AvailabilityCells,
  type AvailabilityIntervalInput,
  type SerializedAvailabilityInterval,
} from './availability-intervals';

@Injectable()
export class AvailabilityIntervalsService {
  private readonly cells = signal<AvailabilityCells>({});

  reset(): void {
    this.cells.set({});
  }

  load(intervals: readonly AvailabilityIntervalInput[], slotMinutes: number): void {
    this.cells.set(expandIntervalsToCells(intervals, slotMinutes));
  }

  paint(localDate: string, startTime: string, kind: AvailabilityBrush): boolean {
    const key = availabilityCellKey(localDate, startTime);
    const current = this.cells();

    if (kind === 'CLEAR') {
      if (!(key in current)) return false;

      this.cells.update(({ [key]: _, ...rest }) => rest);
      return true;
    }

    if (current[key] === kind) return false;

    this.cells.update((cells) => ({ ...cells, [key]: kind }));
    return true;
  }

  cellAt(localDate: string, startTime: string): AvailabilityKind | null {
    return this.cells()[availabilityCellKey(localDate, startTime)] ?? null;
  }

  toIntervals(slotMinutes: number): SerializedAvailabilityInterval[] {
    return compressCellsToIntervals(this.cells(), slotMinutes);
  }
}
