import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { Poll } from '@shared/api';
import { ParticipantSessionService } from '../../model/participant-session/participant-session.service';
import { BrowserTimeZoneService } from '@shared/lib/dates';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { PollsApiService } from '../../api/polls-api/polls-api.service';
import { PollCreationPageComponent } from './poll-creation-page.component';
import { PollScheduleFormComponent } from '../poll-schedule-form/poll-schedule-form.component';

describe('PollCreationPageComponent', () => {
  const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'green' as const };

  function scheduleForm(
    fixture: ReturnType<typeof TestBed.createComponent<PollCreationPageComponent>>,
  ) {
    return fixture.debugElement.query(By.directive(PollScheduleFormComponent))
      .componentInstance as PollScheduleFormComponent;
  }

  function poll(overrides: Partial<Poll> = {}): Poll {
    return {
      id: 'previous-poll',
      sequenceNo: 1,
      title: 'Past title',
      timeZone: 'Asia/Yekaterinburg',
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
      ...overrides,
    };
  }

  async function setup(
    options: {
      me?: typeof member | null;
      polls?: Poll[];
      currentPoll?: Poll | null;
    } = {},
  ) {
    const inviteCode = 'invite-code';
    const workspace = signal({
      group: { id: 'group-id', name: 'Team', inviteCode },
      me: options.me === undefined ? member : options.me,
      participants: [],
      polls: options.polls ?? [],
      currentPoll: options.currentPoll ?? null,
    });
    const facade = {
      inviteCode: signal(inviteCode),
      workspace,
      loading: signal(false),
      notFound: signal(false),
      loadError: signal(null),
      reload: vi.fn(),
    };
    const createPoll = vi.fn().mockReturnValue(of({ poll: poll({ id: 'new-poll' }) }));
    await TestBed.configureTestingModule({
      imports: [PollCreationPageComponent],
      providers: [
        provideRouter([]),
        { provide: BrowserTimeZoneService, useValue: { timeZone: 'Asia/Yekaterinburg' } },
        { provide: GroupFacade, useValue: facade },
        { provide: PollsApiService, useValue: { createPoll } },
        {
          provide: ParticipantSessionService,
          useValue: {
            get: vi.fn(() =>
              facade.workspace().me
                ? { participantId: member.id, token: 'participant-token' }
                : null,
            ),
          },
        },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(PollCreationPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    return { fixture, component: fixture.componentInstance, facade, createPoll, navigate };
  }

  it('starts with a fresh seven-day window and initial schedule defaults', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T23:30:00.000Z'));
    try {
      const { fixture } = await setup();
      expect(scheduleForm(fixture).form.getRawValue()).toEqual({
        title: '',
        startsOn: '2026-10-08',
        endsOn: '2026-10-14',
        dayStart: '16:00',
        dayEnd: '23:00',
        slotMinutes: 30,
        meetingDurationMinutes: 60,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies only schedule settings from the previous poll', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T23:30:00.000Z'));
    try {
      const { fixture } = await setup({ polls: [poll()] });
      expect(scheduleForm(fixture).form.getRawValue()).toEqual({
        title: '',
        startsOn: '2026-10-08',
        endsOn: '2026-10-14',
        dayStart: '17:00',
        dayEnd: '22:00',
        slotMinutes: 60,
        meetingDurationMinutes: 120,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates a poll for the active participant and returns to the group', async () => {
    const { fixture, createPoll, navigate } = await setup({ polls: [poll()] });

    await scheduleForm(fixture).submit();

    expect(createPoll).toHaveBeenCalledWith(
      'invite-code',
      {
        timeZone: 'Asia/Yekaterinburg',
        title: null,
        startsOn: expect.any(String),
        endsOn: expect.any(String),
        dayStart: '17:00',
        dayEnd: '22:00',
        slotMinutes: 60,
        meetingDurationMinutes: 120,
      },
      'participant-token',
    );
    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code']);
  });

  it('redirects nonmembers and groups with an active poll', async () => {
    const noMember = await setup({ me: null });
    expect(noMember.navigate).toHaveBeenCalledWith(['/g', 'invite-code', 'profile']);
    TestBed.resetTestingModule();

    const active = await setup({ currentPoll: poll({ status: 'OPEN' }) });
    expect(active.navigate).toHaveBeenCalledWith(['/g', 'invite-code']);
  });
});
