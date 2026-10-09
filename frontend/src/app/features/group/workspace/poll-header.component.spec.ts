import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Poll } from '../../../core/api/api.types';
import { PollHeaderComponent } from './poll-header.component';

const poll: Poll = {
  id: 'poll-id',
  sequenceNo: 3,
  title: 'Planning',
  timeZone: 'America/New_York',
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
    fixture.detectChanges();
  });

  it('formats poll calendar dates in the long Russian form', () => {
    const chips = [...fixture.nativeElement.querySelectorAll('mat-chip')].map((chip: Element) =>
      chip.textContent.trim(),
    );
    expect(chips).toEqual(['1 ноября 2026', '1 ноября 2026']);
    expect(fixture.nativeElement.textContent).not.toContain('UTC');
  });

  it('does not shift a schedule calendar date when local time crosses UTC midnight', () => {
    fixture.componentRef.setInput('poll', {
      ...poll,
      startsOn: '2026-10-03',
      endsOn: '2026-10-03',
      dayStart: '06:30',
      dayEnd: '07:30',
    });
    fixture.detectChanges();
    expect(
      [...fixture.nativeElement.querySelectorAll('mat-chip')].map((chip: Element) =>
        chip.textContent.trim(),
      ),
    ).toEqual(['3 октября 2026', '3 октября 2026']);
  });
});
