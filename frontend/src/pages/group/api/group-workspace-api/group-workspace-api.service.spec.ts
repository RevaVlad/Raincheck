import { ApplicationRef, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Workspace } from '@shared/api';
import { GroupWorkspaceApiService } from './group-workspace-api.service';

describe('GroupWorkspaceApiService', () => {
  let workspaceApi: GroupWorkspaceApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), GroupWorkspaceApiService],
    });
    workspaceApi = TestBed.inject(GroupWorkspaceApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

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
});
