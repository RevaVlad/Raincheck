import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  RaincheckApiService,
  type CreateGroupRequest,
  type ReplaceResponseRequest,
} from './raincheck-api.service';

describe('RaincheckApiService', () => {
  let api: RaincheckApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), RaincheckApiService],
    });
    api = TestBed.inject(RaincheckApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates a group with the UTC schedule', () => {
    const request: CreateGroupRequest = {
      name: 'Team',
      creatorDisplayName: 'Alex',
      timezone: 'UTC',
      firstPoll: {
        startsOn: '2026-10-06',
        endsOn: '2026-10-12',
        dayStart: '16:00',
        dayEnd: '23:00',
        slotMinutes: 30,
        meetingDurationMinutes: 60,
      },
    };

    api.createGroup(request).subscribe();

    const call = http.expectOne('/api/groups');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(request);
    call.flush({});
  });

  it('sends a participant token only on the requested workspace call', () => {
    const token = 'secret-participant-token';

    api.getWorkspace('invite-a').subscribe();
    const anonymous = http.expectOne('/api/groups/invite-a/workspace');
    expect(anonymous.request.headers.has('X-Participant-Token')).toBe(false);
    expect(anonymous.request.headers.has('Authorization')).toBe(false);
    anonymous.flush({});

    api.getWorkspace('invite-b', token).subscribe();
    const identified = http.expectOne('/api/groups/invite-b/workspace');
    expect(identified.request.headers.get('X-Participant-Token')).toBe(token);
    expect(identified.request.headers.has('Authorization')).toBe(false);
    identified.flush({});
  });

  it('joins the group without sending an existing participant token', () => {
    api.joinGroup('invite-a', { displayName: 'Alex' }).subscribe();

    const call = http.expectOne('/api/groups/invite-a/participants');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ displayName: 'Alex' });
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    call.flush({});
  });

  it('loads public poll results from the analytics endpoint', () => {
    api.getPollResults('invite-a', 'poll-a').subscribe();
    const call = http.expectOne('/api/groups/invite-a/polls/poll-a/results');
    expect(call.request.method).toBe('GET');
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    call.flush({ participantSummary: { total: 0, confirmed: 0, pending: 0 }, heatmap: [], bestSlots: [] });
  });

  it('scopes response read, create, replace, and confirm calls with the participant token', () => {
    const path = '/api/groups/invite-a/polls/poll-a/responses/me';
    const token = 'secret-participant-token';
    const headers = (url: string, method: string) => {
      const call = http.expectOne(url);
      expect(call.request.method).toBe(method);
      expect(call.request.headers.get('X-Participant-Token')).toBe(token);
      expect(call.request.headers.has('Authorization')).toBe(false);
      return call;
    };

    api.getMyResponse('invite-a', 'poll-a', token).subscribe();
    headers(path, 'GET').flush({});

    api.createMyResponse('invite-a', 'poll-a', token).subscribe();
    headers(path, 'POST').flush({});

    const intervals: ReplaceResponseRequest = {
      intervals: [
        {
          localDate: '2026-10-06',
          startTime: '09:00',
          endTime: '09:30',
          kind: 'PREFERRED',
          preferenceDirection: 'FLAT',
        },
      ],
    };
    api.replaceMyResponse('invite-a', 'poll-a', token, intervals).subscribe();
    const replacement = headers(path, 'PUT');
    expect(replacement.request.body).toEqual(intervals);
    replacement.flush({});

    api.confirmMyResponse('invite-a', 'poll-a', token).subscribe();
    headers(`${path}/confirm`, 'POST').flush({});
  });
});
