import { ApplicationRef } from '@angular/core';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { ParticipantInput, Workspace } from '../../core/api/api.types';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { resolveGroupInviteCode } from './group.routes';
import { GroupFacade } from './group.facade';
import { GroupsApiService } from '../../core/api/groups-api.service';
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
    updateProfile = vi.fn().mockReturnValue(of({})),
    inviteCode = 'invite-code',
  ) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GroupFacade,
        GroupsApiService,
        {
          provide: ParticipantsApiService,
          useValue: { joinGroup, updateProfile },
        },
        { provide: ParticipantSessionService, useValue: session },
      ],
    });
    const facade = TestBed.inject(GroupFacade);
    const http = TestBed.inject(HttpTestingController);
    facade.setInviteCode(inviteCode);
    TestBed.tick();
    return { facade, http, joinGroup, updateProfile };
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

  it('creates and stores a new profile, then reloads with the new token', async () => {
    const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'green' as const };
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

    await expect(facade.saveProfile({ displayName: 'Alex', avatarColor: 'green' })).resolves.toBe(
      true,
    );
    TestBed.tick();

    expect(joinGroup).toHaveBeenCalledWith('invite-code', {
      displayName: 'Alex',
      avatarColor: 'green',
    });
    expect(session.store).toHaveBeenCalledWith('invite-code', {
      participantId: 'participant-id',
      token: 'secret-token',
    });
    const reloaded = http.expectOne('/api/groups/invite-code/workspace');
    expect(reloaded.request.headers.get('X-Participant-Token')).toBe('secret-token');
    reloaded.flush(workspace('invite-code', member));
    await waitForResource();
    expect(facade.workspace()?.me).toEqual(member);
    expect(facade.savingProfile()).toBe(false);
  });

  it('updates a current profile through its stored token without replacing it', async () => {
    const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'green' as const };
    const updated = { ...member, displayName: 'Alex Smith', avatarColor: 'purple' as const };
    const identity = { participantId: member.id, token: 'existing-token' };
    const session = { get: vi.fn(() => identity), store: vi.fn(), clear: vi.fn() };
    const updateProfile = vi.fn().mockReturnValue(of({ participant: updated }));
    const { facade, http } = setup(session, vi.fn(), updateProfile);
    http.expectOne('/api/groups/invite-code/workspace').flush(workspace('invite-code', member));
    await waitForResource();

    await expect(
      facade.saveProfile({ displayName: 'Alex Smith', avatarColor: 'purple' }),
    ).resolves.toBe(true);
    TestBed.tick();

    expect(updateProfile).toHaveBeenCalledWith('invite-code', 'existing-token', {
      displayName: 'Alex Smith',
      avatarColor: 'purple',
    });
    expect(session.store).not.toHaveBeenCalled();
    const reloaded = http.expectOne('/api/groups/invite-code/workspace');
    expect(reloaded.request.headers.get('X-Participant-Token')).toBe('existing-token');
    reloaded.flush(workspace('invite-code', updated));
    await waitForResource();
    expect(facade.workspace()?.me).toEqual(updated);
  });

  it('keeps the name-conflict message and does not reload after a rejected update', async () => {
    const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'green' as const };
    const error = new HttpErrorResponse({
      status: 409,
      error: {
        error: {
          code: 'PARTICIPANT_NAME_TAKEN',
          message: 'Participant name is already used in this group',
          requestId: 'request-id',
        },
      },
    });
    const updateProfile = vi.fn().mockReturnValue(throwError(() => error));
    const session = {
      get: vi.fn(() => ({ participantId: member.id, token: 'existing-token' })),
      clear: vi.fn(),
    };
    const { facade, http } = setup(session, vi.fn(), updateProfile);
    http.expectOne('/api/groups/invite-code/workspace').flush(workspace('invite-code', member));
    await waitForResource();

    await expect(facade.saveProfile({ displayName: 'Taken', avatarColor: 'rose' })).resolves.toBe(
      false,
    );

    expect(facade.profileError()).toContain('уже используется');
    expect(facade.savingProfile()).toBe(false);
    http.expectNone('/api/groups/invite-code/workspace');
  });

  it('keeps a new profile form active when browser storage refuses the new token', async () => {
    const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'green' as const };
    const session = { get: vi.fn(() => null), store: vi.fn(() => false), clear: vi.fn() };
    const joinGroup = vi
      .fn()
      .mockReturnValue(of({ participant: member, participantEditToken: 'secret-token' }));
    const { facade, http } = setup(session, joinGroup);
    http.expectOne('/api/groups/invite-code/workspace').flush(workspace('invite-code'));
    await waitForResource();

    await expect(facade.saveProfile({ displayName: 'Alex', avatarColor: 'green' })).resolves.toBe(
      false,
    );

    expect(session.store).toHaveBeenCalledOnce();
    expect(facade.profileError()).toBeTruthy();
    expect(facade.savingProfile()).toBe(false);
    http.expectNone('/api/groups/invite-code/workspace');
  });

  it('clears a stale optional identity and treats profile save as first entry', async () => {
    const identity = { participantId: 'old-participant', token: 'old-secret' };
    const member = { id: 'new-participant', displayName: 'Alex', avatarColor: 'green' as const };
    let storedIdentity: typeof identity | null = identity;
    const session = {
      get: vi.fn(() => storedIdentity),
      store: vi.fn((_code, next) => {
        storedIdentity = next;
        return true;
      }),
      clear: vi.fn(() => {
        storedIdentity = null;
      }),
    };
    const joinGroup = vi
      .fn()
      .mockReturnValue(of({ participant: member, participantEditToken: 'fresh-token' }));
    const { facade, http } = setup(session, joinGroup);
    const request = http.expectOne('/api/groups/invite-code/workspace');
    expect(request.request.headers.get('X-Participant-Token')).toBe('old-secret');
    request.flush(workspace('invite-code'));
    await waitForResource();
    expect(session.clear).toHaveBeenCalledWith('invite-code');

    await expect(facade.saveProfile({ displayName: 'Alex', avatarColor: 'green' })).resolves.toBe(
      true,
    );

    expect(joinGroup).toHaveBeenCalledOnce();
    expect(session.store).toHaveBeenCalledWith('invite-code', {
      participantId: 'new-participant',
      token: 'fresh-token',
    });
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
    const { facade, http } = setup(
      { get: vi.fn(() => null), clear: vi.fn() },
      vi.fn(),
      vi.fn(),
      'old-code',
    );
    const oldRequest = http.expectOne('/api/groups/old-code/workspace');
    facade.setInviteCode('new-code');
    TestBed.tick();
    expect(oldRequest.cancelled).toBe(true);
    http.expectOne('/api/groups/new-code/workspace').flush(workspace('new-code'));
    await waitForResource();

    expect(facade.workspace()?.group.name).toBe('new-code');
  });

  it('ignores a stale profile creation completion after the invite code changes', async () => {
    const firstSave = new Subject<{
      participant: { id: string; displayName: string; avatarColor: 'green' };
      participantEditToken: string;
    }>();
    const secondSave = new Subject<{
      participant: { id: string; displayName: string; avatarColor: 'green' };
      participantEditToken: string;
    }>();
    const joinGroup = vi.fn().mockReturnValueOnce(firstSave).mockReturnValueOnce(secondSave);
    let storedIdentity: { participantId: string; token: string } | null = null;
    const session = {
      get: vi.fn(() => storedIdentity),
      store: vi.fn((_code, identity) => {
        storedIdentity = identity;
        return true;
      }),
      clear: vi.fn(),
    };
    const { facade, http } = setup(session, joinGroup, vi.fn(), 'first-code');
    http.expectOne('/api/groups/first-code/workspace').flush(workspace('first-code'));
    await waitForResource();
    const firstRequest = facade.saveProfile({ displayName: 'Alex', avatarColor: 'green' });
    facade.setInviteCode('second-code');
    TestBed.tick();
    http.expectOne('/api/groups/second-code/workspace').flush(workspace('second-code'));
    await waitForResource();
    const secondRequest = facade.saveProfile({ displayName: 'Sam', avatarColor: 'green' });
    expect(facade.savingProfile()).toBe(true);

    firstSave.next({
      participant: { id: 'old', displayName: 'Alex', avatarColor: 'green' },
      participantEditToken: 'old-token',
    });
    await expect(firstRequest).resolves.toBe(false);
    expect(facade.savingProfile()).toBe(true);
    expect(session.store).not.toHaveBeenCalled();

    secondSave.next({
      participant: { id: 'new', displayName: 'Sam', avatarColor: 'green' },
      participantEditToken: 'new-token',
    });
    await expect(secondRequest).resolves.toBe(true);
    TestBed.tick();
    const reload = http.expectOne('/api/groups/second-code/workspace');
    expect(reload.request.headers.get('X-Participant-Token')).toBe('new-token');
    reload.flush(workspace('second-code', { id: 'new', displayName: 'Sam', avatarColor: 'green' }));
    await waitForResource();
    expect(facade.savingProfile()).toBe(false);
  });

  it('hands editor identity invalidation back to the group facade', async () => {
    const member = { id: 'participant-id', displayName: 'Alex', avatarColor: 'green' as const };
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
    expect(facade.profileError()).toBeTruthy();
  });
});
