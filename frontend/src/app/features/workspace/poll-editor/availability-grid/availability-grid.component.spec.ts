import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PollEditorService } from '../poll-editor.service';
import { AvailabilityGridComponent } from './availability-grid.component';

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
});
