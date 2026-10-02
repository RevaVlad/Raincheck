import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { RaincheckApiService } from '../../core/api/raincheck-api.service';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { GroupEntryPageComponent } from './group-entry-page.component';

describe('GroupEntryPageComponent', () => {
  it('loads anonymously, joins, stores identity, and reloads the workspace', async () => {
    const emptyWorkspace = {
      group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code', timezone: 'UTC' },
      me: null,
      participants: [],
      polls: [],
      currentPoll: null,
    };
    const member = { id: 'participant-id', displayName: 'Alex' };
    const memberWorkspace = { ...emptyWorkspace, me: member };
    const getWorkspace = vi
      .fn()
      .mockReturnValueOnce(of(emptyWorkspace))
      .mockReturnValueOnce(of(memberWorkspace));
    const joinGroup = vi.fn().mockReturnValue(
      of({ participant: member, participantEditToken: 'secret-token' }),
    );
    let storedIdentity: { participantId: string; token: string } | null = null;
    const store = vi.fn((_inviteCode: string, identity: { participantId: string; token: string }) => {
      storedIdentity = identity;
      return true;
    });

    await TestBed.configureTestingModule({
      imports: [GroupEntryPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'invite-code' } } },
        },
        { provide: RaincheckApiService, useValue: { getWorkspace, joinGroup } },
        { provide: ParticipantSessionService, useValue: { get: () => storedIdentity, store, clear: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(GroupEntryPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(getWorkspace).toHaveBeenCalledWith('invite-code', undefined);
    expect(fixture.componentInstance.workspace()?.me).toBeNull();
    fixture.componentInstance.displayName = 'Alex';
    await fixture.componentInstance.join();

    expect(joinGroup).toHaveBeenCalledWith('invite-code', { displayName: 'Alex' });
    expect(store).toHaveBeenCalledWith('invite-code', {
      participantId: 'participant-id',
      token: 'secret-token',
    });
    expect(getWorkspace).toHaveBeenLastCalledWith('invite-code', 'secret-token');
    expect(fixture.componentInstance.workspace()?.me).toEqual(member);
  });

  it('clears a stale optional identity when workspace returns me null', async () => {
    const identity = { participantId: 'old-participant', token: 'old-secret' };
    const clear = vi.fn();
    const getWorkspace = vi.fn().mockReturnValue(
      of({ group: {}, me: null, participants: [], polls: [], currentPoll: null }),
    );
    await TestBed.configureTestingModule({
      imports: [GroupEntryPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'invite-code' } } },
        },
        { provide: RaincheckApiService, useValue: { getWorkspace } },
        { provide: ParticipantSessionService, useValue: { get: () => identity, clear, store: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(GroupEntryPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(getWorkspace).toHaveBeenCalledWith('invite-code', 'old-secret');
    expect(clear).toHaveBeenCalledWith('invite-code');
    expect(fixture.componentInstance.workspace()?.me).toBeNull();
  });
});
