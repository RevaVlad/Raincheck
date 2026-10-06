import { ApplicationRef, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import type { Poll, PollResults, Workspace } from '../../core/api/api.types';
import { PollResultsApiService } from './poll-results-api.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { PollResultsPageComponent } from './poll-results-page.component';
import { GroupFacade } from '../group/group.facade';

describe('PollResultsPageComponent', () => {
  const result = (total: number): PollResults => ({
    participantSummary: { total, confirmed: 0, pending: total },
    bestSlots: [],
    heatmap: [],
    participants: [],
  });

  const poll: Poll = {
    id: 'poll-a',
    sequenceNo: 1,
    title: 'Планирование команды',
    startsOn: '2026-10-05',
    endsOn: '2026-10-11',
    dayStart: '09:00',
    dayEnd: '10:00',
    slotMinutes: 30,
    meetingDurationMinutes: 30,
    status: 'CLOSED',
    basedOnPollId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    closedAt: '2026-10-12T00:00:00.000Z',
  };

  const workspace: Workspace = {
    group: { id: 'group-a', name: 'Design team', inviteCode: 'group-a', timezone: 'UTC' },
    me: null,
    participants: [
      { id: 'alice', displayName: 'Алиса', currentPollState: 'NONE' },
      { id: 'bob', displayName: 'Боб', currentPollState: 'NONE' },
    ],
    polls: [poll],
    currentPoll: null,
  };

  function setup() {
    const params = new BehaviorSubject(
      convertToParamMap({ inviteCode: 'group-a', pollId: 'poll-a' }),
    );
    TestBed.configureTestingModule({
      imports: [PollResultsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        PollResultsApiService,
        { provide: GroupFacade, useValue: { workspace: signal(workspace) } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
        {
          provide: TimezonePreferenceService,
          useValue: {
            selectedTimeZone: signal('UTC'),
            ensureConfirmed: vi.fn().mockResolvedValue('UTC'),
          },
        },
      ],
    });
    return { params, http: TestBed.inject(HttpTestingController) };
  }

  it('loads route-selected results and follows later route changes', async () => {
    const { params, http } = setup();
    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    http.expectOne('/api/groups/group-a/polls/poll-a/results').flush(result(1));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="group-home-link"]').getAttribute('href'),
    ).toBe('/g/group-a');
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(1);

    params.next(convertToParamMap({ inviteCode: 'group-b', pollId: 'poll-b' }));
    TestBed.tick();
    http.expectOne('/api/groups/group-b/polls/poll-b/results').flush(result(2));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.inviteCode()).toBe('group-b');
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="group-home-link"]').getAttribute('href'),
    ).toBe('/g/group-b');
  });

  it('cancels an older result request when route parameters change', async () => {
    const { params, http } = setup();
    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    const oldRequest = http.expectOne('/api/groups/group-a/polls/poll-a/results');

    params.next(convertToParamMap({ inviteCode: 'group-b', pollId: 'poll-b' }));
    TestBed.tick();
    expect(oldRequest.cancelled).toBe(true);
    http.expectOne('/api/groups/group-b/polls/poll-b/results').flush(result(2));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(2);
    expect(fixture.componentInstance.inviteCode()).toBe('group-b');
  });

  it('retries a failed results request', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    http
      .expectOne('/api/groups/group-a/polls/poll-a/results')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'offline', requestId: 'request' } },
        { status: 500, statusText: 'Server Error' },
      );
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('offline');

    fixture.componentInstance.reload();
    TestBed.tick();
    http.expectOne('/api/groups/group-a/polls/poll-a/results').flush(result(3));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(3);
  });

  it('keeps the group sidebar and shows pending count with the selected poll states', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.componentInstance.timezone.selectedTimeZone.set('America/Los_Angeles');
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    http.expectOne('/api/groups/group-a/polls/poll-a/results').flush({
      participantSummary: { total: 2, confirmed: 1, pending: 1 },
      participants: [
        { id: 'alice', displayName: 'Алиса', state: 'CONFIRMED' },
        { id: 'bob', displayName: 'Боб', state: 'NONE' },
      ],
      bestSlots: [],
      heatmap: [
        {
          localDate: '2026-10-06',
          startTime: '06:00',
          endTime: '06:30',
          available: 1,
          ifNeeded: 0,
          preferred: 1,
          unavailable: 0,
          averageSoftScore: 1,
        },
      ],
    });
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-group-sidebar')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ожидаем ещё 1');
    expect(fixture.nativeElement.textContent).toContain('Планирование команды');
    expect(fixture.nativeElement.textContent).toContain('Алиса');
    expect(fixture.nativeElement.textContent).toContain('Готово');
    expect(fixture.nativeElement.textContent).toContain('Нет ответа');
    expect(fixture.nativeElement.textContent).toContain('1/1');
    expect(fixture.nativeElement.textContent).toContain('23:00');
    expect(fixture.nativeElement.textContent).toContain('5 окт.');
  });
});
