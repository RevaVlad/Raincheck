import { Injectable, signal } from '@angular/core';

import type { AvailabilityBrush, AvailabilityKind } from '../poll-editor.service';
import type { IntervalInput, PollSlot } from '../../../../../core/api/api.types';
import {
  compressCellsToIntervals,
  expandIntervalsToCells,
  type AvailabilityCells,
  type SerializedAvailabilityInterval,
} from './availability-intervals';

@Injectable()
export class AvailabilityIntervalsService {
  private readonly cells = signal<AvailabilityCells>({});

  reset(): void {
    this.cells.set({});
  }

  load(intervals: readonly IntervalInput[], slots: readonly PollSlot[]): void {
    this.cells.set(expandIntervalsToCells(intervals, slots));
  }

  paint(startAt: string, kind: AvailabilityBrush): boolean {
    const key = startAt;
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

  cellAt(startAt: string): AvailabilityKind | null {
    return this.cells()[startAt] ?? null;
  }

  toIntervals(slots: readonly PollSlot[]): SerializedAvailabilityInterval[] {
    return compressCellsToIntervals(this.cells(), slots);
  }
}
