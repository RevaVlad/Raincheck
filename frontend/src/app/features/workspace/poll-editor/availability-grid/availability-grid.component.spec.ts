import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PollEditorService } from '../poll-editor.service';
import { AvailabilityGridComponent } from './availability-grid.component';
import { TimezonePreferenceService } from '../../../../core/timezone/timezone-preference.service';

describe('AvailabilityGridComponent', () => {
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
    expect(fixture.componentInstance.displayTime('2026-11-01', '05:00')).toBe('01:00');
    expect(fixture.componentInstance.displayTime('2026-11-01', '06:00')).toBe('01:00');
    const cells = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-time]')];
    expect(
      cells.map((cell) => (cell as HTMLElement).dataset['time']),
    ).toEqual(['05:00', '06:00']);
  });
});
