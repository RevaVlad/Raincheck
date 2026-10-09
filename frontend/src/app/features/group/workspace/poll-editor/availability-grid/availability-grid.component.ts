import { Component, computed, inject, input } from '@angular/core';
import type { PollSlot } from '../../../../../core/api/api.types';
import {
  formatCalendarDate,
  formatInstantTime,
  formatInstantWeekday,
  localCalendarDate,
} from '../../../../../core/dates/date.utils';
import { BrowserTimeZoneService } from '../../../../../core/dates/browser-timezone.service';
import { AvailabilityBrush, AvailabilityKind, PollEditorService } from '../poll-editor.service';
import { AvailabilityGridCellComponent } from './availability-grid-cell.component';

interface Day {
  date: string;
  weekday: string;
}

interface GridRow {
  id: string;
  time: string;
  slots: Array<PollSlot | null>;
}

@Component({
  selector: 'app-availability-grid',
  imports: [AvailabilityGridCellComponent],
  templateUrl: './availability-grid.component.html',
  styleUrl: './availability-grid.component.css',
})
export class AvailabilityGridComponent {
  readonly selectedKind = input.required<AvailabilityBrush>();
  private readonly editor = inject(PollEditorService);
  private readonly timezone = inject(BrowserTimeZoneService);

  private readonly projectedSlots = computed(() => {
    const slots = this.editor.poll()?.slots ?? [];
    return slots.map((slot) => ({
      slot,
      date: localCalendarDate(slot.startAt, this.timezone.timeZone),
      time: formatInstantTime(slot.startAt, this.timezone.timeZone),
      weekday: formatInstantWeekday(slot.startAt, this.timezone.timeZone),
    }));
  });

  readonly days = computed<Day[]>(() => {
    const days = new Map<string, string>();
    for (const { date, weekday } of this.projectedSlots()) days.set(date, weekday);
    return [...days]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, weekday]) => ({
        date,
        weekday,
      }));
  });

  readonly gridTemplateColumns = computed(() => {
    const dayCount = this.days().length;
    return dayCount ? `68px repeat(${dayCount}, minmax(128px, 1fr))` : '68px';
  });

  readonly rows = computed<GridRow[]>(() => {
    const byDateAndTime = new Map<string, Map<string, PollSlot[]>>();
    for (const projected of this.projectedSlots()) {
      const times = byDateAndTime.get(projected.date) ?? new Map<string, PollSlot[]>();
      const repeated = times.get(projected.time) ?? [];
      repeated.push(projected.slot);
      times.set(projected.time, repeated);
      byDateAndTime.set(projected.date, times);
    }

    const dates = this.days().map(({ date }) => date);
    const times = [...new Set(this.projectedSlots().map(({ time }) => time))].sort();
    return times.flatMap((time) => {
      const count = Math.max(
        ...dates.map((date) => byDateAndTime.get(date)?.get(time)?.length ?? 0),
      );
      return Array.from({ length: count }, (_, occurrence) => ({
        id: `${time}-${occurrence}`,
        time,
        slots: dates.map((date) => byDateAndTime.get(date)?.get(time)?.[occurrence] ?? null),
      }));
    });
  });

  dateLabel(date: string): string {
    return formatCalendarDate(date, 'short');
  }

  state(startAt: string): AvailabilityKind | null {
    return this.editor.cellAt(startAt);
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
      ?.closest<HTMLElement>('[data-start-at]');
    if (cell) this.paint(cell);
  }

  onPointerUp(event: PointerEvent): void {
    this.stopPainting(event);
  }

  onPointerCancel(event: PointerEvent): void {
    this.stopPainting(event);
  }

  private paintingPointerId: number | null = null;

  private cellFromTarget(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('[data-start-at]') : null;
  }

  private paint(cell: HTMLElement): void {
    const startAt = cell.dataset['startAt'];
    if (startAt) this.editor.paint(startAt, this.selectedKind());
  }

  private stopPainting(event: PointerEvent): void {
    if (event.pointerId !== this.paintingPointerId) return;
    this.paintingPointerId = null;
    const grid = event.currentTarget as HTMLElement;
    if (grid.hasPointerCapture(event.pointerId)) grid.releasePointerCapture(event.pointerId);
  }
}
