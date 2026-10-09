import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavigationCancel, Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { Subject } from 'rxjs';
import type { Poll, WorkspacePoll } from '@shared/api';
import { ParticipantSessionService } from '../../model/participant-session/participant-session.service';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { GroupSidebarContext } from '../../model/group-sidebar-context/group-sidebar-context.service';
import { PollsApiService } from '../../api/polls-api/polls-api.service';
import { PollCloseControlComponent } from '../poll-close-control/poll-close-control.component';
import {
  AvailabilityIntervalsService,
  ConfirmResponseButtonComponent,
  PollEditorService,
} from '@features/respond-to-poll';
import { GroupWorkspaceComponent } from './group-workspace.component';

describe('GroupWorkspaceComponent leave checks', () => {
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
      imports: [GroupWorkspaceComponent],
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
      ],
    })
      .overrideComponent(GroupWorkspaceComponent, {
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
    const fixture = TestBed.createComponent(GroupWorkspaceComponent);
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
      timeZone: 'UTC',
      slotMinutes: 30,
      meetingDurationMinutes: 60,
      createdAt: '2026-10-01T00:00:00.000Z',
      basedOnPollId: null,
      closedAt: null,
      ...values,
    };
  }

  async function configureWorkspaceWithRealEditor() {
    const activePoll: WorkspacePoll = {
      ...poll({ id: 'active-poll', sequenceNo: 1, status: 'OPEN' }),
      slots: [
        {
          startAt: '2026-11-01T09:00:00.000Z',
          endAt: '2026-11-01T09:30:00.000Z',
        },
      ],
    };
    const me = { id: 'participant-id', displayName: 'Alex', avatarColor: 'green' as const };
    const group = {
      inviteCode: signal('invite-code'),
      workspace: signal({
        group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code' },
        me,
        participants: [{ ...me, currentPollState: 'DRAFT' as const }],
        polls: [activePoll],
        currentPoll: activePoll,
      }),
      registerLeaveCheck: vi.fn(() => () => {}),
      invalidateIdentity: vi.fn(),
      reload: vi.fn(),
      refreshWorkspace: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [GroupWorkspaceComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        GroupSidebarContext,
        { provide: GroupFacade, useValue: group },
        {
          provide: ParticipantSessionService,
          useValue: { get: () => ({ participantId: me.id, token: 'test-token' }) },
        },
        { provide: MatDialog, useValue: { open: vi.fn(() => ({ afterClosed: () => of(true) })) } },
        { provide: PollsApiService, useValue: { closePoll: vi.fn() } },
      ],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const createFixture = async () => {
      const fixture = TestBed.createComponent(GroupWorkspaceComponent);
      fixture.detectChanges();
      http
        .expectOne('/api/groups/invite-code/polls/active-poll/responses/me')
        .flush({ id: 'response-id', state: 'DRAFT', confirmedAt: null, intervals: [] });
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    };
    return { createFixture, http };
  }

  it(
    'shares one editor across workspace, grid, toolbar, confirmation ' + 'and close controls',
    async () => {
      const { createFixture, http } = await configureWorkspaceWithRealEditor();
      const fixture = await createFixture();
      const workspaceEditor = fixture.debugElement.injector.get(PollEditorService);
      const grid = fixture.debugElement.query(By.css('app-availability-grid'));
      const toolbar = fixture.debugElement.query(By.css('app-availability-toolbar'));
      const confirmation = fixture.debugElement.query(By.directive(ConfirmResponseButtonComponent));
      const close = fixture.debugElement.query(By.directive(PollCloseControlComponent));

      expect(grid).not.toBeNull();
      expect(toolbar).not.toBeNull();
      expect(confirmation).not.toBeNull();
      expect(close).not.toBeNull();
      if (!grid || !toolbar || !confirmation || !close)
        throw new Error('Workspace children missing.');

      expect(grid.injector.get(PollEditorService)).toBe(workspaceEditor);
      expect(toolbar.injector.get(PollEditorService)).toBe(workspaceEditor);
      expect(confirmation.injector.get(PollEditorService)).toBe(workspaceEditor);
      expect(close.injector.get(PollEditorService)).toBe(workspaceEditor);
      expect(grid.injector.get(AvailabilityIntervalsService)).toBe(
        fixture.debugElement.injector.get(AvailabilityIntervalsService),
      );

      http.verify();
      fixture.destroy();
    },
  );

  it('creates a fresh editor for a new workspace', async () => {
    const { createFixture, http } = await configureWorkspaceWithRealEditor();
    const firstFixture = await createFixture();
    const firstEditor = firstFixture.debugElement.injector.get(PollEditorService);
    const firstIntervals = firstFixture.debugElement.injector.get(AvailabilityIntervalsService);
    firstFixture.destroy();

    const secondFixture = await createFixture();

    expect(secondFixture.debugElement.injector.get(PollEditorService)).not.toBe(firstEditor);
    expect(secondFixture.debugElement.injector.get(AvailabilityIntervalsService)).not.toBe(
      firstIntervals,
    );
    http.verify();
    secondFixture.destroy();
  });

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
