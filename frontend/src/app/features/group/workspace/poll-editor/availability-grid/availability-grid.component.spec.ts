import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PollSlot } from '../../../../../core/api/api.types';
import { BrowserTimeZoneService } from '../../../../../core/dates/browser-timezone.service';
import { PollEditorService } from '../poll-editor.service';
import { AvailabilityGridComponent } from './availability-grid.component';

function slot(startAt: string, minutes = 30): PollSlot {
  return {
    startAt,
    endAt: new Date(Date.parse(startAt) + minutes * 60_000).toISOString(),
  };
}

async function createGrid(slots: PollSlot[], timeZone = 'UTC') {
  const editor = { poll: signal({ slots }), cellAt: () => null, paint: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [AvailabilityGridComponent],
    providers: [
      { provide: PollEditorService, useValue: editor },
      { provide: BrowserTimeZoneService, useValue: { timeZone } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AvailabilityGridComponent);
  fixture.componentRef.setInput('selectedKind', 'PREFERRED');
  fixture.detectChanges();
  return { editor, fixture };
}

describe('AvailabilityGridComponent', () => {
  it.each([1, 2, 7])('uses %i local date columns', async (dayCount) => {
    const slots = Array.from({ length: dayCount }, (_, index) =>
      slot(`2026-10-${String(6 + index).padStart(2, '0')}T09:00:00.000Z`, 60),
    );
    const { fixture } = await createGrid(slots);
    const root = fixture.nativeElement as HTMLElement;
    const grid = root.querySelector('.schedule-grid') as HTMLElement;

    expect(grid.style.gridTemplateColumns).toBe(`68px repeat(${dayCount}, minmax(128px, 1fr))`);
    expect(root.querySelectorAll('.day')).toHaveLength(dayCount);
    expect(root.querySelector('.day span')?.textContent?.trim()).toBe('6 окт. 2026');
    expect(grid.parentElement?.classList.contains('overflow-x-auto')).toBe(true);
  });

  it('uses local labels for a UTC slot and omits timezone names from accessible text', async () => {
    const { fixture } = await createGrid([slot('2026-10-06T09:00:00.000Z', 60)]);
    const cell = fixture.nativeElement.querySelector('app-availability-grid-cell') as HTMLElement;
    expect(cell.dataset['startAt']).toBe('2026-10-06T09:00:00.000Z');
    expect(cell.title).toBe('6 октября 2026 09:00');
    expect(cell.getAttribute('aria-label')).toBe('6 октября 2026 09:00: нейтрально');
    expect(cell.outerHTML).not.toContain('UTC');
  });

  it('paints distinct UTC cells while dragging across dates', async () => {
    const first = slot('2026-10-06T09:00:00.000Z');
    const second = slot('2026-10-07T09:00:00.000Z');
    const { editor, fixture } = await createGrid([first, second]);
    const root = fixture.nativeElement as HTMLElement;
    const grid = root.querySelector('.schedule-grid') as HTMLElement;
    const [firstCell, secondCell] = grid.querySelectorAll('app-availability-grid-cell');
    Object.defineProperties(grid, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    const oldElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => secondCell),
    });

    try {
      fixture.componentInstance.onPointerDown({
        pointerId: 7,
        target: firstCell,
        currentTarget: grid,
        preventDefault: vi.fn(),
      } as unknown as PointerEvent);
      fixture.componentInstance.onPointerMove({
        pointerId: 7,
        clientX: 0,
        clientY: 0,
      } as PointerEvent);
      fixture.componentInstance.onPointerUp({
        pointerId: 7,
        currentTarget: grid,
      } as unknown as PointerEvent);
    } finally {
      if (oldElementFromPoint)
        Object.defineProperty(document, 'elementFromPoint', oldElementFromPoint);
      else Reflect.deleteProperty(document, 'elementFromPoint');
    }

    expect(editor.paint.mock.calls).toEqual([
      [first.startAt, 'PREFERRED'],
      [second.startAt, 'PREFERRED'],
    ]);
  });

  it('keeps repeated local clock labels as separate UTC rows', async () => {
    const first = slot('2026-11-01T05:00:00.000Z');
    const second = slot('2026-11-01T06:00:00.000Z');
    const { fixture } = await createGrid([first, second], 'America/New_York');
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.time')].map((node) => node.textContent?.trim())).toEqual([
      '01:00',
      '01:00',
    ]);
    expect(
      [...root.querySelectorAll('[data-start-at]')].map(
        (node) => (node as HTMLElement).dataset['startAt'],
      ),
    ).toEqual([first.startAt, second.startAt]);
    expect(root.textContent).not.toContain('UTC');
  });

  it('projects UTC-midnight-crossing slots into a fractional-offset local date', async () => {
    const slots = [slot('2026-10-06T23:30:00.000Z'), slot('2026-10-07T00:00:00.000Z')];
    const { fixture } = await createGrid(slots, 'Asia/Kolkata');
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.day span')].map((node) => node.textContent?.trim())).toEqual(
      ['7 окт. 2026'],
    );
    expect([...root.querySelectorAll('.time')].map((node) => node.textContent?.trim())).toEqual([
      '05:00',
      '05:30',
    ]);
  });
});
