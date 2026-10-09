import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PollResults } from '@shared/api';
import { PollResultsApiService } from './poll-results-api.service';

describe('PollResultsApiService', () => {
  let results: PollResultsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), PollResultsApiService],
    });
    results = TestBed.inject(PollResultsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads public results without participant credentials', () => {
    const resource = TestBed.runInInjectionContext(() =>
      results.resultsResource(() => ({ inviteCode: 'group a', pollId: 'poll/a', timeZone: 'UTC' })),
    );
    TestBed.tick();
    const call = http.expectOne(
      (request) =>
        request.url === '/api/groups/group%20a/polls/poll%2Fa/results' &&
        request.params.get('timeZone') === 'UTC',
    );
    expect(call.request.method).toBe('GET');
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    const body: PollResults = {
      participantSummary: { total: 0, confirmed: 0, pending: 0 },
      heatmap: [],
      bestSlots: [],
      participants: [],
    };
    call.flush(body);
  });
});
