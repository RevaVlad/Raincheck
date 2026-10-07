import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PollEditorService } from '../poll-editor.service';
import { AvailabilityGridComponent } from './availability-grid.component';
import { TimezonePreferenceService } from '../../../../core/timezone/timezone-preference.service';

describe('AvailabilityGridComponent', () => {
  it.each([1, 2, 7])('uses %i equal-width day columns', async (dayCount) => {
    const end = new Date(Date.UTC(2026, 9, 6 + dayCount - 1)).toISOString().slice(0, 10);
    const editor = {
      poll: signal({
        id: 'poll-id',
        startsOn: '2026-10-06',
        endsOn: end,
        dayStart: '09:00',
        dayEnd: '10:00',
        slotMinutes: 60,
      }),
      cellAt: () => null,
    };
    await TestBed.configureTestingModule({
      imports: [AvailabilityGridComponent],
      providers: [{ provide: PollEditorService, useValue: editor }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AvailabilityGridComponent);
    fixture.componentRef.setInput('selectedKind', 'PREFERRED');
    fixture.detectChanges();

    const grid = (fixture.nativeElement as HTMLElement).querySelector(
      '.schedule-grid',
    ) as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe(`68px repeat(${dayCount}, minmax(128px, 1fr))`);
    expect(grid.querySelectorAll('.day')).toHaveLength(dayCount);
    expect(grid.parentElement?.classList.contains('overflow-x-auto')).toBe(true);
  });

  it.each([
    { kind: 'UNAVAILABLE' as const, className: 'unavailable' },
    { kind: 'IF_NEEDED' as const, className: 'if-needed' },
    { kind: 'PREFERRED' as const, className: 'preferred' },
  ])(
    'renders the $kind state and timezone label on the cell component host',
    async ({ kind, className }) => {
      const editor = {
        poll: signal({
          id: 'poll-id',
          startsOn: '2026-10-06',
          endsOn: '2026-10-06',
          dayStart: '09:00',
          dayEnd: '10:00',
          slotMinutes: 60,
        }),
        cellAt: () => kind,
      };
      await TestBed.configureTestingModule({
        imports: [AvailabilityGridComponent],
        providers: [{ provide: PollEditorService, useValue: editor }],
      }).compileComponents();

      const timezone = TestBed.inject(TimezonePreferenceService);
      timezone.selectedTimeZone.set('UTC');
      const fixture = TestBed.createComponent(AvailabilityGridComponent);
      fixture.componentRef.setInput('selectedKind', 'PREFERRED');
      fixture.detectChanges();

      const cell = (fixture.nativeElement as HTMLElement).querySelector(
        'app-availability-grid-cell',
      ) as HTMLElement;
      expect(cell).not.toBeNull();
      expect(cell.dataset['date']).toBe('2026-10-06');
      expect(cell.dataset['time']).toBe('09:00');
      expect(cell.classList.contains(className)).toBe(true);
      expect(cell.title).toBe('09:00 UTC+00:00');
      expect(cell.getAttribute('aria-label')).toContain(`09:00 UTC+00:00: ${kind}`);
    },
  );

  it('paints the UTC cells under a captured pointer drag', async () => {
    const paint = vi.fn();
    const editor = {
      poll: signal({
        id: 'poll-id',
        startsOn: '2026-10-06',
        endsOn: '2026-10-07',
        dayStart: '09:00',
        dayEnd: '10:00',
        slotMinutes: 60,
      }),
      cellAt: () => null,
      paint,
    };
    await TestBed.configureTestingModule({
      imports: [AvailabilityGridComponent],
      providers: [{ provide: PollEditorService, useValue: editor }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AvailabilityGridComponent);
    fixture.componentRef.setInput('selectedKind', 'PREFERRED');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const grid = root.querySelector('.schedule-grid') as HTMLElement;
    const [firstCell, secondCell] = grid.querySelectorAll('app-availability-grid-cell');
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn(() => true);
    const releasePointerCapture = vi.fn();
    Object.defineProperties(grid, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: hasPointerCapture },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    });
    const previousElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    const elementFromPoint = vi.fn(() => secondCell);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });

    try {
      fixture.componentInstance.onPointerDown({
        pointerId: 11,
        target: firstCell,
        currentTarget: grid,
        preventDefault: vi.fn(),
      } as unknown as PointerEvent);
      fixture.componentInstance.onPointerMove({
        pointerId: 11,
        clientX: 0,
        clientY: 0,
      } as PointerEvent);
      fixture.componentInstance.onPointerUp({
        pointerId: 11,
        currentTarget: grid,
      } as unknown as PointerEvent);
    } finally {
      if (previousElementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', previousElementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    }

    expect(setPointerCapture).toHaveBeenCalledWith(11);
    expect(paint.mock.calls).toEqual([
      ['2026-10-06', '09:00', 'PREFERRED'],
      ['2026-10-07', '09:00', 'PREFERRED'],
    ]);
    expect(releasePointerCapture).toHaveBeenCalledWith(11);
  });

  it('uses the current poll date range, daily window, and slot size', async () => {
    const editor = {
      poll: signal({
        id: 'poll-id',
        startsOn: '2026-10-06',
        endsOn: '2026-10-07',
        dayStart: '09:00',
        dayEnd: '11:00',
        slotMinutes: 60,
      }),
      cellAt: () => null,
    };
    await TestBed.configureTestingModule({
      imports: [AvailabilityGridComponent],
      providers: [{ provide: PollEditorService, useValue: editor }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AvailabilityGridComponent);
    fixture.componentRef.setInput('selectedKind', 'PREFERRED');
    fixture.detectChanges();

    expect(fixture.componentInstance.days().map(({ localDate }) => localDate)).toEqual([
      '2026-10-06',
      '2026-10-07',
    ]);
    expect(fixture.componentInstance.slots().map(({ time }) => time)).toEqual(['09:00', '10:00']);
  });

  it('keeps repeated local clock labels attached to distinct UTC cells', async () => {
    const editor = {
      poll: signal({
        id: 'poll-id',
        startsOn: '2026-11-01',
        endsOn: '2026-11-01',
        dayStart: '05:00',
        dayEnd: '07:00',
        slotMinutes: 60,
      }),
      cellAt: () => null,
    };
    await TestBed.configureTestingModule({
      imports: [AvailabilityGridComponent],
      providers: [{ provide: PollEditorService, useValue: editor }],
    }).compileComponents();

    const timezone = TestBed.inject(TimezonePreferenceService);
    timezone.selectedTimeZone.set('America/New_York');
    const fixture = TestBed.createComponent(AvailabilityGridComponent);
    fixture.componentRef.setInput('selectedKind', 'PREFERRED');
    fixture.detectChanges();

    expect(fixture.componentInstance.slots().map(({ time }) => time)).toEqual(['05:00', '06:00']);
    const cells = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-time]')];
    expect(cells.map((cell) => (cell as HTMLElement).dataset['time'])).toEqual(['05:00', '06:00']);
    expect(cells.map((cell) => (cell as HTMLElement).title)).toEqual([
      '01:00 UTC-04:00',
      '01:00 UTC-05:00',
    ]);
    expect((cells[0] as HTMLElement).getAttribute('aria-label')).toContain('UTC-04:00');

    timezone.selectedTimeZone.set('UTC');
    fixture.detectChanges();
    expect(cells.map((cell) => (cell as HTMLElement).title)).toEqual([
      '05:00 UTC+00:00',
      '06:00 UTC+00:00',
    ]);
  });

  it('labels UTC rows unambiguously when local times differ across dates at DST', async () => {
    const editor = {
      poll: signal({
        id: 'poll-id',
        startsOn: '2026-03-08',
        endsOn: '2026-03-09',
        dayStart: '06:00',
        dayEnd: '08:00',
        slotMinutes: 60,
      }),
      cellAt: () => null,
    };
    await TestBed.configureTestingModule({
      imports: [AvailabilityGridComponent],
      providers: [{ provide: PollEditorService, useValue: editor }],
    }).compileComponents();

    const timezone = TestBed.inject(TimezonePreferenceService);
    timezone.selectedTimeZone.set('America/New_York');
    const fixture = TestBed.createComponent(AvailabilityGridComponent);
    fixture.componentRef.setInput('selectedKind', 'PREFERRED');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.time')].map((node) => node.textContent.trim())).toEqual([
      '06:00 UTC',
      '07:00 UTC',
    ]);
    expect(
      [...root.querySelectorAll('[data-time]')].map((cell) => (cell as HTMLElement).title),
    ).toEqual(['01:00 UTC-05:00', '02:00 UTC-04:00', '03:00 UTC-04:00', '03:00 UTC-04:00']);
  });
});
