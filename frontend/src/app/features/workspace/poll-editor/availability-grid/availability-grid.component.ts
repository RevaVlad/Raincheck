import { Component, computed, inject, input } from '@angular/core';
import { AvailabilityBrush, AvailabilityKind, PollEditorService } from '../poll-editor.service';
import { TimezonePreferenceService } from '../../../../core/timezone/timezone-preference.service';
import { TimezoneDisplayPipe } from '../../../../core/timezone/timezone-display.pipe';
import { AvailabilityGridCellComponent } from './availability-grid-cell.component';

interface Slot {
  time: string;
}

interface Day {
  localDate: string;
  startTime: string;
}

@Component({
  selector: 'app-availability-grid',
  imports: [TimezoneDisplayPipe, AvailabilityGridCellComponent],
  templateUrl: './availability-grid.component.html',
  styleUrl: './availability-grid.component.css',
})
export class AvailabilityGridComponent {
  readonly selectedKind = input.required<AvailabilityBrush>();
  private readonly editor = inject(PollEditorService);
  readonly timezone = inject(TimezonePreferenceService);
  readonly days = computed<Day[]>(() => {
    const poll = this.editor.poll();
    if (!poll) return [];

    const days = [];
    const date = new Date(`${poll.startsOn}T00:00:00Z`);
    const end = new Date(`${poll.endsOn}T00:00:00Z`);
    while (date <= end) {
      const localDate = date.toISOString().slice(0, 10);
      days.push({ localDate, startTime: poll.dayStart });
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return days;
  });
  readonly gridTemplateColumns = computed(() => {
    const dayCount = this.days().length;
    return dayCount ? `68px repeat(${dayCount}, minmax(128px, 1fr))` : '68px';
  });
  readonly slots = computed<Slot[]>(() => {
    const poll = this.editor.poll();
    if (!poll) return [];
    const start = toMinutes(poll.dayStart);
    const end = toMinutes(poll.dayEnd);
    const slots: Slot[] = [];
    for (let minute = start; minute < end; minute += poll.slotMinutes) {
      slots.push({ time: toTime(minute) });
    }
    return slots;
  });
  private paintingPointerId: number | null = null;

  state(localDate: string, startTime: string): AvailabilityKind | null {
    return this.editor.cellAt(localDate, startTime);
  }

  onPointerDown(event: PointerEvent): void {
    const cell = this.cellFromTarget(event.target);
    if (!cell) return;

    event.preventDefault();
    this.paintingPointerId = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.paint(cell);
  }

  onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.paintingPointerId) return;
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-date][data-time]');
    if (cell) this.paint(cell);
  }

  onPointerUp(event: PointerEvent): void {
    this.stopPainting(event);
  }

  onPointerCancel(event: PointerEvent): void {
    this.stopPainting(event);
  }

  private cellFromTarget(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('[data-date][data-time]') : null;
  }

  private paint(cell: HTMLElement): void {
    const localDate = cell.dataset['date'];
    const startTime = cell.dataset['time'];
    if (localDate && startTime) this.editor.paint(localDate, startTime, this.selectedKind());
  }

  private stopPainting(event: PointerEvent): void {
    if (event.pointerId !== this.paintingPointerId) return;

    this.paintingPointerId = null;
    const grid = event.currentTarget as HTMLElement;
    if (grid.hasPointerCapture(event.pointerId)) grid.releasePointerCapture(event.pointerId);
  }
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
