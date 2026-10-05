import { ApplicationRef, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import type { PollResults } from '../../core/api/api.types';
import { PollResultsApiService } from './poll-results-api.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { PollResultsPageComponent } from './poll-results-page.component';

describe('PollResultsPageComponent', () => {
  const result = (total: number): PollResults => ({
    participantSummary: { total, confirmed: 0, pending: total },
    bestSlots: [],
    heatmap: [],
  });

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
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/g/group-a');
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(1);

    params.next(convertToParamMap({ inviteCode: 'group-b', pollId: 'poll-b' }));
    TestBed.tick();
    http.expectOne('/api/groups/group-b/polls/poll-b/results').flush(result(2));
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.inviteCode()).toBe('group-b');
    expect(fixture.componentInstance.results()?.participantSummary.total).toBe(2);
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/g/group-b');
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
});
