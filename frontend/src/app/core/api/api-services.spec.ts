import { ApplicationRef, signal } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GroupsApiService } from '../../features/group/groups-api.service';
import { ParticipantsApiService } from '../../features/group/participants-api.service';
import { PollResultsApiService } from '../../features/results/poll-results-api.service';
import { PollResponsesApiService } from '../../features/workspace/poll-editor/poll-responses-api.service';
import { apiErrorCode, apiErrorMessage, isUnauthorized } from './api-errors';
import type { CreateGroupRequest, PollResults, Workspace } from './api.types';

describe('feature API services', () => {
  let groups: GroupsApiService;
  let participants: ParticipantsApiService;
  let results: PollResultsApiService;
  let responses: PollResponsesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GroupsApiService,
        ParticipantsApiService,
        PollResultsApiService,
        PollResponsesApiService,
      ],
    });
    groups = TestBed.inject(GroupsApiService);
    participants = TestBed.inject(ParticipantsApiService);
    results = TestBed.inject(PollResultsApiService);
    responses = TestBed.inject(PollResponsesApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates a group without participant credentials', () => {
    const body: CreateGroupRequest = {
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

    groups.createGroup(body).subscribe();

    const call = http.expectOne('/api/groups');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual(body);
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    call.flush({});
  });

  it('starts workspace reads only when enabled and cancels superseded reads', async () => {
    const parameters = signal<{ inviteCode: string; token?: string } | undefined>(undefined);
    const resource = TestBed.runInInjectionContext(() =>
      groups.workspaceResource(() => parameters()),
    );
    TestBed.tick();
    http.expectNone(() => true);

    parameters.set({ inviteCode: 'old code', token: 'old-token' });
    TestBed.tick();
    const oldRequest = http.expectOne('/api/groups/old%20code/workspace');
    expect(oldRequest.request.headers.get('X-Participant-Token')).toBe('old-token');

    parameters.set({ inviteCode: 'new/code' });
    TestBed.tick();
    expect(oldRequest.cancelled).toBe(true);
    const currentRequest = http.expectOne('/api/groups/new%2Fcode/workspace');
    expect(currentRequest.request.headers.has('X-Participant-Token')).toBe(false);
    const body: Workspace = {
      group: { id: 'group', name: 'Group', inviteCode: 'new/code', timezone: 'UTC' },
      me: null,
      participants: [],
      polls: [],
      currentPoll: null,
    };
    currentRequest.flush(body);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(resource.value()).toEqual(body);
  });

  it('joins without forwarding an existing participant token', () => {
    participants.joinGroup('invite/code', { displayName: 'Alex' }).subscribe();

    const call = http.expectOne('/api/groups/invite%2Fcode/participants');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ displayName: 'Alex' });
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    call.flush({});
  });

  it('loads public results without participant credentials', () => {
    const resource = TestBed.runInInjectionContext(() =>
      results.resultsResource(() => ({ inviteCode: 'group a', pollId: 'poll/a' })),
    );
    TestBed.tick();
    const call = http.expectOne('/api/groups/group%20a/polls/poll%2Fa/results');
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

  it('scopes each response operation to its explicit participant token', () => {
    const path = '/api/groups/group%2Fa/polls/poll%2Fb/responses/me';
    const token = 'secret-token';
    const verify = (url: string, method: string) => {
      const call = http.expectOne(url);
      expect(call.request.method).toBe(method);
      expect(call.request.headers.get('X-Participant-Token')).toBe(token);
      expect(call.request.headers.has('Authorization')).toBe(false);
      return call;
    };

    responses.getMyResponse('group/a', 'poll/b', token).subscribe();
    verify(path, 'GET').flush({});
    responses.createMyResponse('group/a', 'poll/b', token).subscribe();
    verify(path, 'POST').flush({});
    responses.replaceMyResponse('group/a', 'poll/b', token, { intervals: [] }).subscribe();
    const replacement = verify(path, 'PUT');
    expect(replacement.request.body).toEqual({ intervals: [] });
    replacement.flush({});
    responses.confirmMyResponse('group/a', 'poll/b', token).subscribe();
    verify(`${path}/confirm`, 'POST').flush({});
  });

  it('extracts stable API errors and recognizes an HTTP 401', () => {
    const error = { error: { code: 'UNAUTHORIZED', message: 'Expired' } };
    expect(apiErrorCode(error)).toBe('UNAUTHORIZED');
    expect(apiErrorMessage(error, 'Fallback')).toBe('Expired');
    expect(apiErrorMessage({}, 'Fallback')).toBe('Fallback');
    expect(isUnauthorized(error)).toBe(true);
    expect(isUnauthorized(new HttpErrorResponse({ status: 401 }))).toBe(true);
    expect(isUnauthorized(new HttpErrorResponse({ status: 403 }))).toBe(false);
  });
});
