import { Injectable, computed, signal } from '@angular/core';
import {
  availabilityCellKey,
  compressCellsToIntervals,
  type AvailabilityCells,
  type SerializedAvailabilityInterval,
} from './availability-grid/availability-intervals';

export type AvailabilityKind = 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';

@Injectable()
export class PollEditorService {
  readonly selectedKind = signal<AvailabilityKind>('PREFERRED');
  readonly cells = signal<AvailabilityCells>({});
  readonly label = computed(() => {
    const labels: Record<AvailabilityKind, string> = {
      UNAVAILABLE: 'Не могу',
      IF_NEEDED: 'Если понадобится',
      PREFERRED: 'Удобно',
    };
    return labels[this.selectedKind()];
  });

  select(kind: AvailabilityKind): void {
    this.selectedKind.set(kind);
  }

  paint(localDate: string, startTime: string, kind: AvailabilityKind): void {
    this.cells.update((cells) => ({
      ...cells,
      [availabilityCellKey(localDate, startTime)]: kind,
    }));
  }

  cellAt(localDate: string, startTime: string): AvailabilityKind | null {
    return this.cells()[availabilityCellKey(localDate, startTime)] ?? null;
  }

  toIntervals(): SerializedAvailabilityInterval[] {
    return compressCellsToIntervals(this.cells());
  }
}
