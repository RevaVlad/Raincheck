import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PollsApiService } from './polls-api.service';

describe('PollsApiService', () => {
  let polls: PollsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), PollsApiService],
    });
    polls = TestBed.inject(PollsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates and closes polls with the explicit participant token', () => {
    const input = {
      timeZone: 'Asia/Yekaterinburg',
      startsOn: '2026-10-07',
      endsOn: '2026-10-13',
      dayStart: '16:00',
      dayEnd: '23:00',
      slotMinutes: 30 as const,
      meetingDurationMinutes: 60,
    };
    const token = 'secret-token';

    polls.createPoll('group/a', input, token).subscribe();
    const create = http.expectOne('/api/groups/group%2Fa/polls');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(input);
    expect(create.request.headers.get('X-Participant-Token')).toBe(token);
    create.flush({ poll: {} });

    polls.closePoll('group/a', 'poll/b', token).subscribe();
    const close = http.expectOne('/api/groups/group%2Fa/polls/poll%2Fb/close');
    expect(close.request.method).toBe('POST');
    expect(close.request.body).toBeNull();
    expect(close.request.headers.get('X-Participant-Token')).toBe(token);
    close.flush({ poll: {} });
  });
});
