import { TestBed } from '@angular/core/testing';
import type { Poll, PollInput } from '../../core/api/api.types';
import { PollScheduleFormComponent } from './poll-schedule-form.component';

describe('PollScheduleFormComponent', () => {
  async function setup(previousPoll: Poll | null = null) {
    await TestBed.configureTestingModule({
      imports: [PollScheduleFormComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PollScheduleFormComponent);
    fixture.componentRef.setInput('previousPoll', previousPoll);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('keeps fresh dates and defaults the first schedule', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T23:30:00.000Z'));
    try {
      const { component } = await setup();
      expect(component.form.getRawValue()).toEqual({
        title: '',
        startsOn: '2026-10-07',
        endsOn: '2026-10-13',
        dayStart: '16:00',
        dayEnd: '23:00',
        slotMinutes: 30,
        meetingDurationMinutes: 60,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies schedule settings from the previous poll', async () => {
    const { component } = await setup({
      id: 'past',
      sequenceNo: 1,
      title: null,
      startsOn: '2026-10-01',
      endsOn: '2026-10-07',
      dayStart: '17:00',
      dayEnd: '22:00',
      slotMinutes: 60,
      meetingDurationMinutes: 120,
      status: 'CLOSED',
      basedOnPollId: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      closedAt: '2026-10-07T00:00:00.000Z',
    });

    expect(component.form.getRawValue()).toMatchObject({
      title: '',
      dayStart: '17:00',
      dayEnd: '22:00',
      slotMinutes: 60,
      meetingDurationMinutes: 120,
    });
  });

  it('does not emit invalid date windows or schedules', async () => {
    const { component } = await setup();
    const save = vi.fn<(input: PollInput) => void>();
    component.save.subscribe(save);
    component.form.patchValue({ startsOn: '2026-10-01', endsOn: '2026-10-09' });
    component.submit();
    expect(save).not.toHaveBeenCalled();
    expect(component.validationError()).toContain('1 до 7');

    component.form.patchValue({
      startsOn: '2026-10-01',
      endsOn: '2026-10-07',
      slotMinutes: 60,
      meetingDurationMinutes: 90,
    });
    component.submit();
    expect(save).not.toHaveBeenCalled();
    expect(component.validationError()).toContain('длительность встречи');
  });
});
