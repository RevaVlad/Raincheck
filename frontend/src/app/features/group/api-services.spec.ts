import { ApplicationRef, signal } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiErrorCode, apiErrorMessage, isUnauthorized } from '../../core/api/api-errors';
import type { PollResults, Workspace } from '../../core/api/api.types';
import { ParticipantsApiService } from './entry/participants-api.service';
import { PollsApiService } from './poll-creation/polls-api.service';
import { PollResultsApiService } from './results/poll-results-api.service';
import { PollResponsesApiService } from './workspace/poll-editor/poll-responses-api.service';
import { GroupWorkspaceApiService } from './workspace/group-workspace-api.service';

describe('feature API services', () => {
  let workspaceApi: GroupWorkspaceApiService;
  let polls: PollsApiService;
  let participants: ParticipantsApiService;
  let results: PollResultsApiService;
  let responses: PollResponsesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GroupWorkspaceApiService,
        PollsApiService,
        ParticipantsApiService,
        PollResultsApiService,
        PollResponsesApiService,
      ],
    });
    workspaceApi = TestBed.inject(GroupWorkspaceApiService);
    polls = TestBed.inject(PollsApiService);
    participants = TestBed.inject(ParticipantsApiService);
    results = TestBed.inject(PollResultsApiService);
    responses = TestBed.inject(PollResponsesApiService);
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

  it('starts workspace reads only when enabled and cancels superseded reads', async () => {
    const parameters = signal<{ inviteCode: string; token?: string } | undefined>(undefined);
    const resource = TestBed.runInInjectionContext(() =>
      workspaceApi.workspaceResource(() => parameters()),
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
      group: { id: 'group', name: 'Group', inviteCode: 'new/code' },
      me: null,
      participants: [],
      polls: [],
      currentPoll: null,
    };
    currentRequest.flush(body);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(resource.value()).toEqual(body);
  });

  it('fetches fresh workspace data with the current participant token', () => {
    workspaceApi.getWorkspace('group/code', 'secret-token').subscribe();

    const call = http.expectOne('/api/groups/group%2Fcode/workspace');
    expect(call.request.method).toBe('GET');
    expect(call.request.headers.get('X-Participant-Token')).toBe('secret-token');
    call.flush({});
  });

  it('joins without forwarding an existing participant token', () => {
    participants
      .joinGroup('invite/code', { displayName: 'Alex', avatarColor: 'green' })
      .subscribe();

    const call = http.expectOne('/api/groups/invite%2Fcode/participants');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({ displayName: 'Alex', avatarColor: 'green' });
    expect(call.request.headers.has('X-Participant-Token')).toBe(false);
    call.flush({});
  });

  it('updates a participant profile with its scoped token', () => {
    participants
      .updateProfile('invite/code', 'secret-token', {
        displayName: 'Alex',
        avatarColor: 'purple',
      })
      .subscribe();

    const call = http.expectOne('/api/groups/invite%2Fcode/participants/me');
    expect(call.request.method).toBe('PATCH');
    expect(call.request.headers.get('X-Participant-Token')).toBe('secret-token');
    expect(call.request.body).toEqual({ displayName: 'Alex', avatarColor: 'purple' });
    call.flush({
      participant: { id: 'participant-id', displayName: 'Alex', avatarColor: 'purple' },
    });
  });

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
