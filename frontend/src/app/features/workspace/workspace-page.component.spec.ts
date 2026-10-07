import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationCancel, Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { Subject } from 'rxjs';
import type { Poll } from '../../core/api/api.types';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { GroupFacade } from '../group/group.facade';
import { GroupSidebarContext } from '../group/group-sidebar-context.service';
import { PollsApiService } from '../group/polls-api.service';
import { PollEditorService } from './poll-editor/poll-editor.service';
import { WorkspacePageComponent } from './workspace-page.component';

describe('WorkspacePageComponent leave checks', () => {
  async function createPage(
    pending = true,
    saveDraft: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
    polls: Poll[] = [],
    participants: {
      id: string;
      displayName: string;
      avatarColor: 'green' | 'blue' | 'purple' | 'rose' | 'yellow' | 'gray';
      currentPollState: 'NONE' | 'DRAFT' | 'CONFIRMED';
    }[] = [],
    me: {
      id: string;
      displayName: string;
      avatarColor: 'green' | 'blue' | 'purple' | 'rose' | 'yellow' | 'gray';
    } | null = null,
    dialogResult = true,
    closePoll = vi.fn().mockReturnValue(of({ poll: { id: 'closed-poll' } })),
  ) {
    const editor = {
      selectedKind: signal('PREFERRED'),
      pendingChanges: signal(pending),
      responseLoaded: signal(true),
      responseId: signal<string | null>(null),
      responseState: signal('DRAFT'),
      saveState: signal('LOADING'),
      lastSaveError: signal(null),
      saveNow: vi.fn(saveDraft),
      beginLeaving: vi.fn(),
      cancelLeaving: vi.fn(),
      load: vi.fn(),
    };
    const group = {
      inviteCode: signal('invite-code'),
      workspace: signal({
        group: {
          id: 'group-id',
          name: 'Team',
          inviteCode: 'invite-code',
          timezone: 'UTC' as const,
        },
        me,
        participants,
        polls,
        currentPoll: polls.find((item) => item.status === 'OPEN') ?? null,
      }),
      registerLeaveCheck: vi.fn(() => () => {}),
      reload: vi.fn(),
      refreshWorkspace: vi.fn(),
    };
    group.refreshWorkspace.mockImplementation(async () => group.workspace());
    const dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(dialogResult) })),
    };
    await TestBed.configureTestingModule({
      imports: [WorkspacePageComponent],
      providers: [
        provideRouter([]),
        GroupSidebarContext,
        { provide: GroupFacade, useValue: group },
        { provide: MatDialog, useValue: dialog },
        { provide: PollsApiService, useValue: { closePoll } },
        {
          provide: ParticipantSessionService,
          useValue: {
            get: vi.fn(() => (me ? { participantId: me.id, token: 'secret' } : null)),
          },
        },
        {
          provide: TimezonePreferenceService,
          useValue: { selectedTimeZone: signal('UTC'), ensureConfirmed: vi.fn() },
        },
      ],
    })
      .overrideComponent(WorkspacePageComponent, {
        set: {
          providers: [
            { provide: PollEditorService, useValue: editor },
            { provide: MatDialog, useValue: dialog },
          ],
        },
      })
      .compileComponents();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const routerEvents = new Subject<unknown>();
    Object.defineProperty(router, 'events', { value: routerEvents });
    const fixture = TestBed.createComponent(WorkspacePageComponent);
    fixture.detectChanges();
    return {
      page: fixture.componentInstance,
      editor,
      routerEvents,
      fixture,
      dialog,
      closePoll,
      group,
      navigate,
      sidebar: TestBed.inject(GroupSidebarContext),
    };
  }

  function poll(values: Pick<Poll, 'id' | 'sequenceNo' | 'status'> & Partial<Poll>): Poll {
    return {
      startsOn: '2026-11-01',
      endsOn: '2026-11-01',
      dayStart: '09:00',
      dayEnd: '10:00',
      slotMinutes: 30,
      meetingDurationMinutes: 60,
      createdAt: '2026-10-01T00:00:00.000Z',
      basedOnPollId: null,
      closedAt: null,
      ...values,
    };
  }

  it('waits for one draft save across repeated leave attempts', async () => {
    let finishSave!: () => void;
    const saveDraft = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const { page, editor } = await createPage(true, saveDraft);
    const first = page.canLeave();
    const repeated = page.canLeave();

    expect(first).toBe(repeated);
    expect(editor.saveNow).toHaveBeenCalledOnce();
    expect(editor.beginLeaving).not.toHaveBeenCalled();
    finishSave();

    await expect(first).resolves.toBe(true);
    expect(editor.beginLeaving).toHaveBeenCalledOnce();
  });

  it('stays in the editor when saving the draft fails', async () => {
    const saveDraft = vi.fn().mockRejectedValue(new Error('offline'));
    const { page, editor } = await createPage(true, saveDraft);

    await expect(page.canLeave()).resolves.toBe(false);
    expect(editor.beginLeaving).not.toHaveBeenCalled();
  });

  it('skips saving when no edits or mutations are pending', async () => {
    const { page, editor } = await createPage(false);

    await expect(page.canLeave()).resolves.toBe(true);
    expect(editor.saveNow).not.toHaveBeenCalled();
  });

  it('restores the editor when a later router guard cancels navigation', async () => {
    const { page, editor, routerEvents } = await createPage();
    await expect(page.canLeave()).resolves.toBe(true);

    routerEvents.next(new NavigationCancel(1, '/g/invite-code', 'A later guard cancelled'));

    expect(editor.cancelLeaving).toHaveBeenCalledOnce();
  });

  it('updates sidebar state and clears it when the workspace is destroyed', async () => {
    const me = { id: 'self', displayName: 'Alex', avatarColor: 'green' as const };
    const participant = { ...me, currentPollState: 'DRAFT' as const };
    const activePoll = poll({ id: 'active', sequenceNo: 1, status: 'OPEN' });
    const { editor, fixture, sidebar } = await createPage(
      false,
      undefined,
      [activePoll],
      [participant],
      me,
    );

    expect(sidebar.temporaryPresentation()?.().participants?.[0].currentPollState).toBe('NONE');
    editor.responseId.set('response-id');
    editor.responseState.set('CONFIRMED');
    expect(sidebar.temporaryPresentation()?.().participants?.[0].currentPollState).toBe(
      'CONFIRMED',
    );

    fixture.destroy();
    expect(sidebar.temporaryPresentation()).toBeNull();
  });
});
