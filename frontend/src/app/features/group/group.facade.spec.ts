import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, convertToParamMap } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import type { Workspace } from '../../core/api/raincheck-api.service';
import { RaincheckApiService } from '../../core/api/raincheck-api.service';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { GroupFacade } from './group.facade';
import { resolveGroupInviteCode } from './group.routes';

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
    api: Partial<RaincheckApiService>,
    session: Partial<ParticipantSessionService>,
    inviteCode = 'invite-code',
  ) {
    TestBed.configureTestingModule({
      providers: [
        GroupFacade,
        { provide: RaincheckApiService, useValue: api },
        { provide: ParticipantSessionService, useValue: session },
      ],
    });
    const facade = TestBed.inject(GroupFacade);
    facade.setInviteCode(inviteCode);
    return facade;
  }

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

  it('loads the workspace, joins, stores identity, and reloads', async () => {
    const member = { id: 'participant-id', displayName: 'Alex' };
    let storedIdentity: { participantId: string; token: string } | null = null;
    const api = {
      getWorkspace: vi
        .fn()
        .mockReturnValueOnce(of(workspace('invite-code')))
        .mockReturnValueOnce(of(workspace('invite-code', member))),
      joinGroup: vi
        .fn()
        .mockReturnValue(of({ participant: member, participantEditToken: 'secret-token' })),
    };
    const session = {
      get: vi.fn(() => storedIdentity),
      store: vi.fn((_code, identity) => {
        storedIdentity = identity;
        return true;
      }),
      clear: vi.fn(),
    };
    const facade = setup(api, session);

    await vi.waitFor(() => expect(facade.workspace()?.me).toBeNull());
    await facade.join(' Alex ');

    expect(api.joinGroup).toHaveBeenCalledWith('invite-code', { displayName: 'Alex' });
    expect(session.store).toHaveBeenCalledWith('invite-code', {
      participantId: 'participant-id',
      token: 'secret-token',
    });
    expect(api.getWorkspace).toHaveBeenLastCalledWith('invite-code', 'secret-token');
    expect(facade.workspace()?.me).toEqual(member);
    expect(facade.joining()).toBe(false);
  });

  it('clears a stale optional identity when the workspace has no current participant', async () => {
    const identity = { participantId: 'old-participant', token: 'old-secret' };
    const clear = vi.fn();
    const facade = setup(
      { getWorkspace: vi.fn().mockReturnValue(of(workspace('invite-code'))) },
      { get: vi.fn().mockReturnValue(identity), clear, store: vi.fn() },
    );

    await vi.waitFor(() => expect(facade.loading()).toBe(false));

    expect(clear).toHaveBeenCalledWith('invite-code');
  });

  it('retries a blocking workspace load failure', async () => {
    const api = {
      getWorkspace: vi
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('offline')))
        .mockReturnValueOnce(of(workspace('invite-code'))),
    };
    const facade = setup(api, { get: vi.fn().mockReturnValue(null), clear: vi.fn() });

    await vi.waitFor(() => expect(facade.loadError()).toBeTruthy());
    facade.reload();
    await vi.waitFor(() => expect(facade.workspace()?.group.name).toBe('invite-code'));

    expect(facade.loadError()).toBeNull();
  });

  it('responds to invite-code changes and ignores a stale workspace response', async () => {
    const firstRequest = new Subject<Workspace>();
    const api = {
      getWorkspace: vi
        .fn()
        .mockReturnValueOnce(firstRequest)
        .mockReturnValueOnce(of(workspace('new-code'))),
    };
    const facade = setup(api, { get: vi.fn().mockReturnValue(null) }, 'old-code');

    facade.setInviteCode('new-code');
    expect(facade.inviteCode()).toBe('new-code');
    await vi.waitFor(() => expect(facade.workspace()?.group.name).toBe('new-code'));
    firstRequest.next(workspace('old-code'));

    expect(api.getWorkspace).toHaveBeenNthCalledWith(1, 'old-code', undefined);
    expect(api.getWorkspace).toHaveBeenNthCalledWith(2, 'new-code', undefined);
    expect(facade.workspace()?.group.name).toBe('new-code');
  });

  it('keeps the current group join state when an older join completes after navigation', async () => {
    const firstJoin = new Subject<{
      participant: { id: string; displayName: string };
      participantEditToken: string;
    }>();
    const secondJoin = new Subject<{
      participant: { id: string; displayName: string };
      participantEditToken: string;
    }>();
    const api = {
      getWorkspace: vi.fn((code: string) => of(workspace(code))),
      joinGroup: vi.fn().mockReturnValueOnce(firstJoin).mockReturnValueOnce(secondJoin),
    };
    const session = {
      get: vi.fn(() => null),
      store: vi.fn(() => true),
      clear: vi.fn(),
    };
    const facade = setup(api, session, 'first-code');

    await vi.waitFor(() => expect(facade.loading()).toBe(false));
    const firstRequest = facade.join('Alex');
    facade.setInviteCode('second-code');
    await vi.waitFor(() => expect(facade.loading()).toBe(false));
    const secondRequest = facade.join('Sam');
    expect(facade.joining()).toBe(true);

    firstJoin.next({
      participant: { id: 'first-participant', displayName: 'Alex' },
      participantEditToken: 'first-token',
    });
    await firstRequest;
    expect(facade.joining()).toBe(true);

    secondJoin.next({
      participant: { id: 'second-participant', displayName: 'Sam' },
      participantEditToken: 'second-token',
    });
    await secondRequest;
    expect(facade.joining()).toBe(false);
  });

  it('hands editor identity invalidation back to the group facade', async () => {
    const member = { id: 'participant-id', displayName: 'Alex' };
    const clear = vi.fn();
    const facade = setup(
      { getWorkspace: vi.fn().mockReturnValue(of(workspace('invite-code', member))) },
      { get: vi.fn().mockReturnValue({ participantId: member.id, token: 'secret' }), clear },
    );

    await vi.waitFor(() => expect(facade.workspace()?.me).toEqual(member));
    facade.invalidateIdentity();

    expect(clear).toHaveBeenCalledWith('invite-code');
    expect(facade.workspace()?.me).toBeNull();
    expect(facade.joinError()).toBeTruthy();
  });
});
