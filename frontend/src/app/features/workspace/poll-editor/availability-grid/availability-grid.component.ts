import { Component, input } from '@angular/core';
import { AvailabilityKind } from '../poll-editor.service';

interface Slot {
  time: string;
}

@Component({
  selector: 'app-availability-grid',
  templateUrl: './availability-grid.component.html',
  styleUrl: './availability-grid.component.css',
})
export class AvailabilityGridComponent {
  readonly selectedKind = input.required<AvailabilityKind>();
  readonly days = [
    { weekday: 'Пн', date: '6 окт' },
    { weekday: 'Вт', date: '7 окт' },
    { weekday: 'Ср', date: '8 окт' },
    { weekday: 'Чт', date: '9 окт' },
    { weekday: 'Пт', date: '10 окт' },
    { weekday: 'Сб', date: '11 окт' },
    { weekday: 'Вс', date: '12 окт' },
  ];
  readonly slots: Slot[] = Array.from({ length: 14 }, (_, index) => ({
    time: `${String(16 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
  }));
  private readonly states: Record<string, AvailabilityKind> = {
    '1-4': 'PREFERRED',
    '1-5': 'PREFERRED',
    '1-6': 'PREFERRED',
    '1-7': 'PREFERRED',
    '1-8': 'PREFERRED',
    '3-8': 'IF_NEEDED',
    '3-9': 'IF_NEEDED',
    '3-10': 'IF_NEEDED',
    '4-4': 'UNAVAILABLE',
    '4-5': 'UNAVAILABLE',
    '4-6': 'UNAVAILABLE',
  };

  state(dayIndex: number, slotIndex: number): AvailabilityKind | null {
    return this.states[`${dayIndex}-${slotIndex}`] ?? null;
  }
}
