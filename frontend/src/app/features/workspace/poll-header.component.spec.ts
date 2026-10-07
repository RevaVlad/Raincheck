import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { Poll } from '../../core/api/api.types';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { PollHeaderComponent } from './poll-header.component';

const poll: Poll = {
  id: 'poll-id',
  sequenceNo: 3,
  title: 'Planning',
  startsOn: '2026-11-01',
  endsOn: '2026-11-01',
  dayStart: '05:30',
  dayEnd: '06:30',
  slotMinutes: 30,
  meetingDurationMinutes: 60,
  status: 'OPEN',
  basedOnPollId: null,
  createdAt: '2026-10-02T00:00:00.000Z',
  closedAt: null,
};

describe('PollHeaderComponent', () => {
  let fixture: ComponentFixture<PollHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PollHeaderComponent] }).compileComponents();
    fixture = TestBed.createComponent(PollHeaderComponent);
    fixture.componentRef.setInput('poll', poll);
    TestBed.inject(TimezonePreferenceService).selectedTimeZone.set('America/New_York');
    fixture.detectChanges();
  });

  it('renders the poll title and date chips', () => {
    const chips = [...fixture.nativeElement.querySelectorAll('mat-chip')].map((chip: Element) =>
      chip.textContent.trim(),
    );
    expect(fixture.nativeElement.querySelectorAll('mat-chip')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe('Planning');
    expect(chips).toEqual(['1 нояб. 2026 г.', '1 нояб. 2026 г.']);
  });

  it('formats date chips across local midnight', () => {
    fixture.componentRef.setInput('poll', {
      ...poll,
      startsOn: '2026-10-03',
      endsOn: '2026-10-03',
      dayStart: '06:30',
      dayEnd: '07:30',
    });
    TestBed.inject(TimezonePreferenceService).selectedTimeZone.set('America/Los_Angeles');
    fixture.detectChanges();

    expect(
      [...fixture.nativeElement.querySelectorAll('mat-chip')].map((chip: Element) =>
        chip.textContent.trim(),
      ),
    ).toEqual(['2 окт. 2026 г.', '3 окт. 2026 г.']);
  });
});
