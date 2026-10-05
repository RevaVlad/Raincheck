import { ApplicationRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import type { Workspace } from '../../core/api/api.types';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { resolveGroupInviteCode } from './group.routes';
import { GroupFacade } from './group.facade';
import { GroupsApiService } from './groups-api.service';
import { ParticipantsApiService } from './participants-api.service';

describe('GroupFacade', () => {
  function workspace(inviteCode: string, me: Workspace['me'] = null): Workspace {
    return {
      group: { id: inviteCode, name: inviteCode, inviteCode, timezone: 'UTC' },
      me,
      participants: [],
      polls: [],
      currentPoll: null,
    };
  }

  function setup(
    session: Partial<ParticipantSessionService>,
    joinGroup = vi.fn().mockReturnValue(of({})),
    inviteCode = 'invite-code',
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GroupFacade,
        GroupsApiService,
        { provide: ParticipantsApiService, useValue: { joinGroup } },
        { provide: ParticipantSessionService, useValue: session },
      ],
    });
    const facade = TestBed.inject(GroupFacade);
    const http = TestBed.inject(HttpTestingController);
    facade.setInviteCode(inviteCode);
    TestBed.tick();
    return { facade, http, joinGroup };
  }

  async function waitForResource(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  afterEach(() => TestBed.inject(HttpTestingController, null)?.verify());

  it('passes the invite route parameter into its scoped facade', () => {
    const setInviteCode = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: GroupFacade, useValue: { setInviteCode } }],
    });
    const route = {
      paramMap: convertToParamMap({ inviteCode: 'route-code' }),
    } as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      resolveGroupInviteCode(route, {} as RouterStateSnapshot),
    );

    expect(result).toBe(true);
    expect(setInviteCode).toHaveBeenCalledWith('route-code');
  });

  it('loads the workspace, joins, stores identity, and reloads with that token', async () => {
    const member = { id: 'participant-id', displayName: 'Alex' };
    let storedIdentity: { participantId: string; token: string } | null = null;
    const session = {
      get: vi.fn(() => storedIdentity),
      store: vi.fn((_code, identity) => {
        storedIdentity = identity;
        return true;
      }),
      clear: vi.fn(),
    };
    const joinGroup = vi
      .fn()
      .mockReturnValue(of({ participant: member, participantEditToken: 'secret-token' }));
    const { facade, http } = setup(session, joinGroup);
    http.expectOne('/api/groups/invite-code/workspace').flush(workspace('invite-code'));
    await waitForResource();
    await facade.join(' Alex ');
    TestBed.tick();

    expect(joinGroup).toHaveBeenCalledWith('invite-code', { displayName: 'Alex' });
    expect(session.store).toHaveBeenCalledWith('invite-code', {
      participantId: 'participant-id',
      token: 'secret-token',
    });
    const reloaded = http.expectOne('/api/groups/invite-code/workspace');
    expect(reloaded.request.headers.get('X-Participant-Token')).toBe('secret-token');
    reloaded.flush(workspace('invite-code', member));
    await waitForResource();
    expect(session.get).toHaveBeenCalledTimes(2);
    expect(facade.workspace()?.me).toEqual(member);
    expect(facade.joining()).toBe(false);
  });

  it('clears a stale optional identity when the workspace has no current participant', async () => {
    const identity = { participantId: 'old-participant', token: 'old-secret' };
    const clear = vi.fn();
    const { http } = setup({ get: vi.fn(() => identity), clear });
    const request = http.expectOne('/api/groups/invite-code/workspace');
    expect(request.request.headers.get('X-Participant-Token')).toBe('old-secret');
    request.flush(workspace('invite-code'));
    await waitForResource();

    expect(clear).toHaveBeenCalledWith('invite-code');
  });

  it('retries a workspace load failure', async () => {
    const { facade, http } = setup({ get: vi.fn(() => null), clear: vi.fn() });
    http
      .expectOne('/api/groups/invite-code/workspace')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'offline', requestId: 'request' } },
        { status: 500, statusText: 'Server Error' },
      );
    await waitForResource();
    expect(facade.loadError()).toBeTruthy();
    facade.reload();
    TestBed.tick();
    http.expectOne('/api/groups/invite-code/workspace').flush(workspace('invite-code'));
    await waitForResource();

    expect(facade.workspace()?.group.name).toBe('invite-code');
    expect(facade.loadError()).toBeNull();
  });

  it('cancels a superseded workspace read when the invite code changes', async () => {
    const { facade, http } = setup({ get: vi.fn(() => null), clear: vi.fn() }, vi.fn(), 'old-code');
    const oldRequest = http.expectOne('/api/groups/old-code/workspace');
    facade.setInviteCode('new-code');
    TestBed.tick();
    expect(oldRequest.cancelled).toBe(true);
    http.expectOne('/api/groups/new-code/workspace').flush(workspace('new-code'));
    await waitForResource();

    expect(facade.workspace()?.group.name).toBe('new-code');
  });

  it('ignores a stale join completion after the selected group changes', async () => {
    const firstJoin = new Subject<{
      participant: { id: string; displayName: string };
      participantEditToken: string;
    }>();
    const secondJoin = new Subject<{
      participant: { id: string; displayName: string };
      participantEditToken: string;
    }>();
    const joinGroup = vi.fn().mockReturnValueOnce(firstJoin).mockReturnValueOnce(secondJoin);
    let storedIdentity: { participantId: string; token: string } | null = null;
    const session = {
      get: vi.fn(() => storedIdentity),
      store: vi.fn((_code, identity) => {
        storedIdentity = identity;
        return true;
      }),
      clear: vi.fn(),
    };
    const { facade, http } = setup(session, joinGroup, 'first-code');
    http.expectOne('/api/groups/first-code/workspace').flush(workspace('first-code'));
    await waitForResource();
    const firstRequest = facade.join('Alex');
    facade.setInviteCode('second-code');
    TestBed.tick();
    http.expectOne('/api/groups/second-code/workspace').flush(workspace('second-code'));
    await waitForResource();
    const secondRequest = facade.join('Sam');
    expect(facade.joining()).toBe(true);

    firstJoin.next({
      participant: { id: 'old', displayName: 'Alex' },
      participantEditToken: 'old-token',
    });
    await firstRequest;
    expect(facade.joining()).toBe(true);
    expect(session.store).not.toHaveBeenCalled();

    secondJoin.next({
      participant: { id: 'new', displayName: 'Sam' },
      participantEditToken: 'new-token',
    });
    await secondRequest;
    TestBed.tick();
    const reload = http.expectOne('/api/groups/second-code/workspace');
    expect(reload.request.headers.get('X-Participant-Token')).toBe('new-token');
    reload.flush(workspace('second-code', { id: 'new', displayName: 'Sam' }));
    await waitForResource();
    expect(facade.joining()).toBe(false);
  });

  it('hands editor identity invalidation back to the group facade', async () => {
    const member = { id: 'participant-id', displayName: 'Alex' };
    const clear = vi.fn();
    const { facade, http } = setup({
      get: vi.fn(() => ({ participantId: member.id, token: 'secret' })),
      clear,
    });
    http.expectOne('/api/groups/invite-code/workspace').flush(workspace('invite-code', member));
    await waitForResource();
    facade.invalidateIdentity();

    expect(clear).toHaveBeenCalledWith('invite-code');
    expect(facade.workspace()?.me).toBeNull();
    expect(facade.joinError()).toBeTruthy();
  });
});
