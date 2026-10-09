import { ApplicationRef, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import type { Poll, PollResults, Workspace } from '../../../core/api/api.types';
import { BrowserTimeZoneService } from '../../../core/dates/browser-timezone.service';
import { PollResultsApiService } from './poll-results-api.service';
import { PollResultsPageComponent } from './poll-results-page.component';
import { GroupFacade } from '../group.facade';
import { GroupSidebarContext } from '../group-sidebar-context.service';

describe('PollResultsPageComponent', () => {
  const timeZone = 'America/Los_Angeles';
  const result = (total: number): PollResults => ({
    participantSummary: { total, confirmed: 0, pending: total },
    bestSlots: [],
    heatmap: [],
    participants: [],
  });
  const poll: Poll = {
    id: 'poll-a',
    sequenceNo: 1,
    title: 'Planning',
    timeZone: 'UTC',
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
    group: { id: 'group-a', name: 'Design team', inviteCode: 'group-a' },
    me: null,
    participants: [
      { id: 'alice', displayName: 'Alice', avatarColor: 'gray', currentPollState: 'NONE' },
      { id: 'bob', displayName: 'Bob', avatarColor: 'gray', currentPollState: 'NONE' },
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
        GroupSidebarContext,
        { provide: GroupFacade, useValue: { workspace: signal(workspace) } },
        { provide: BrowserTimeZoneService, useValue: { timeZone } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
      ],
    });
    return {
      params,
      http: TestBed.inject(HttpTestingController),
      sidebar: TestBed.inject(GroupSidebarContext),
    };
  }

  function expectResults(http: HttpTestingController, url: string) {
    return http.expectOne(
      (request) => request.url === url && request.params.get('timeZone') === timeZone,
    );
  }

  it('loads route-selected results, sends the device zone, and follows route changes', async () => {
    const { params, http } = setup();
    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    expectResults(http, '/api/groups/group-a/polls/poll-a/results').flush(result(1));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="group-home-link"]').getAttribute('href'),
    ).toBe('/g/group-a');
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(1);

    params.next(convertToParamMap({ inviteCode: 'group-b', pollId: 'poll-b' }));
    TestBed.tick();
    expectResults(http, '/api/groups/group-b/polls/poll-b/results').flush(result(2));
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
    TestBed.tick();
    const oldRequest = expectResults(http, '/api/groups/group-a/polls/poll-a/results');
    params.next(convertToParamMap({ inviteCode: 'group-b', pollId: 'poll-b' }));
    TestBed.tick();
    expect(oldRequest.cancelled).toBe(true);
    expectResults(http, '/api/groups/group-b/polls/poll-b/results').flush(result(2));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(2);
    expect(fixture.componentInstance.inviteCode()).toBe('group-b');
  });

  it('retries a failed results request', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    expectResults(http, '/api/groups/group-a/polls/poll-a/results').flush(
      { error: { code: 'INTERNAL_ERROR', message: 'offline', requestId: 'request' } },
      { status: 500, statusText: 'Server Error' },
    );
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('offline');
    fixture.componentInstance.reload();
    TestBed.tick();
    expectResults(http, '/api/groups/group-a/polls/poll-a/results').flush(result(3));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(3);
  });

  it('renders UTC results in local time and updates sidebar response states', async () => {
    const { http, sidebar } = setup();
    const fixture = TestBed.createComponent(PollResultsPageComponent);
    fixture.detectChanges();
    TestBed.tick();
    expect(sidebar.temporaryPresentation()?.().showParticipantStatuses).toBe(false);
    expectResults(http, '/api/groups/group-a/polls/poll-a/results').flush({
      participantSummary: { total: 2, confirmed: 1, pending: 1 },
      participants: [
        { id: 'alice', displayName: 'Alice', state: 'CONFIRMED' },
        { id: 'bob', displayName: 'Bob', state: 'NONE' },
      ],
      bestSlots: [],
      heatmap: [
        {
          startAt: '2026-10-06T06:00:00.000Z',
          endAt: '2026-10-06T06:30:00.000Z',
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
    expect(sidebar.temporaryPresentation()?.().participants).toMatchObject([
      { id: 'alice', currentPollState: 'CONFIRMED' },
      { id: 'bob', currentPollState: 'NONE' },
    ]);
    expect(sidebar.temporaryPresentation()?.().showParticipantStatuses).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Planning');
    expect(fixture.nativeElement.textContent).toContain('1/1');
    expect(fixture.nativeElement.textContent).toContain('23:00');
    expect(fixture.nativeElement.textContent).toContain('5 окт. 2026');
    expect(fixture.nativeElement.textContent).not.toContain('UTC');
    expect(fixture.nativeElement.textContent).not.toContain('Los_Angeles');
    fixture.destroy();
    expect(sidebar.temporaryPresentation()).toBeNull();
  });
});
