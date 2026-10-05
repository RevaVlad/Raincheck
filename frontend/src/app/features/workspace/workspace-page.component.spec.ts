import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationCancel, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { GroupFacade } from '../group/group.facade';
import { PollEditorService } from './poll-editor/poll-editor.service';
import { WorkspacePageComponent } from './workspace-page.component';

describe('WorkspacePageComponent leave checks', () => {
  async function createPage(
    pending = true,
    saveDraft: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
  ) {
    const editor = {
      pendingChanges: signal(pending),
      saveNow: vi.fn(saveDraft),
      beginLeaving: vi.fn(),
      cancelLeaving: vi.fn(),
      load: vi.fn(),
    };
    const group = {
      inviteCode: signal('invite-code'),
      workspace: signal({
        group: { name: 'Team' },
        me: null,
        participants: [],
        polls: [],
        currentPoll: null,
      }),
      registerLeaveCheck: vi.fn(() => () => {}),
    };
    await TestBed.configureTestingModule({
      imports: [WorkspacePageComponent],
      providers: [
        { provide: GroupFacade, useValue: group },
        { provide: ParticipantSessionService, useValue: { get: vi.fn(() => null) } },
        {
          provide: TimezonePreferenceService,
          useValue: { selectedTimeZone: signal('UTC'), ensureConfirmed: vi.fn() },
        },
      ],
    })
      .overrideComponent(WorkspacePageComponent, {
        set: { providers: [{ provide: PollEditorService, useValue: editor }] },
      })
      .compileComponents();
    const router = TestBed.inject(Router);
    const routerEvents = new Subject<unknown>();
    Object.defineProperty(router, 'events', { value: routerEvents });
    const fixture = TestBed.createComponent(WorkspacePageComponent);
    fixture.detectChanges();
    return { page: fixture.componentInstance, editor, routerEvents };
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
});
