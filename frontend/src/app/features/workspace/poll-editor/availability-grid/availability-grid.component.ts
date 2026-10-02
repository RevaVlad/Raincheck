import { Component, inject, input } from '@angular/core';
import { AvailabilityKind, PollEditorService } from '../poll-editor.service';

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
  private readonly editor = inject(PollEditorService);
  readonly days = [
    { weekday: 'Вт', date: '6 окт', localDate: '2026-10-06' },
    { weekday: 'Ср', date: '7 окт', localDate: '2026-10-07' },
    { weekday: 'Чт', date: '8 окт', localDate: '2026-10-08' },
    { weekday: 'Пт', date: '9 окт', localDate: '2026-10-09' },
    { weekday: 'Сб', date: '10 окт', localDate: '2026-10-10' },
    { weekday: 'Вс', date: '11 окт', localDate: '2026-10-11' },
    { weekday: 'Пн', date: '12 окт', localDate: '2026-10-12' },
  ];
  readonly slots: Slot[] = Array.from({ length: 14 }, (_, index) => ({
    time: `${String(16 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
  }));
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
    return target instanceof Element
      ? target.closest<HTMLElement>('[data-date][data-time]')
      : null;
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
