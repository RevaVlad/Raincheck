import { Injectable, computed, signal } from '@angular/core';

export type AvailabilityKind = 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';

@Injectable()
export class PollEditorService {
  readonly selectedKind = signal<AvailabilityKind>('PREFERRED');
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
}
