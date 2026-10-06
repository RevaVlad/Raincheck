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
      responseId: signal(null),
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

  it('shows current and past polls in the sidebar with sorted names and destinations', async () => {
    const { fixture } = await createPage(false, undefined, [
      poll({
        id: 'past-1',
        sequenceNo: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        status: 'CLOSED',
      }),
      poll({
        id: 'current',
        sequenceNo: 4,
        title: 'Current poll',
        createdAt: '2026-10-02T00:00:00.000Z',
        status: 'OPEN',
      }),
      poll({
        id: 'past-3',
        sequenceNo: 3,
        createdAt: '2026-10-01T00:00:00.000Z',
        status: 'CLOSED',
      }),
      poll({
        id: 'past-2',
        sequenceNo: 2,
        title: 'Past poll',
        createdAt: '2026-10-01T00:00:00.000Z',
        status: 'CLOSED',
      }),
    ]);
    const sections = [...fixture.nativeElement.querySelectorAll('app-group-sidebar section')];
    const sectionByHeading = (heading: string) =>
      sections.find(
        (section: Element) => section.querySelector('h3')?.textContent.trim() === heading,
      );
    const currentSection = sectionByHeading('Текущий опрос');
    const pastSection = sectionByHeading('Завершённые опросы');
    const currentLink = currentSection?.querySelector('a');
    const pastLinks = [...(pastSection?.querySelectorAll('li a') ?? [])];

    expect(currentLink?.textContent.replace(/\s+/g, ' ').trim()).toBe('Current poll Открыт');
    expect(currentLink?.getAttribute('href')).toBe('/g/invite-code');
    expect(currentLink?.classList.contains('bg-emerald-50')).toBe(true);
    expect(currentLink?.classList.contains('ring-1')).toBe(true);
    expect(pastLinks.map((link) => link.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Опрос #3 Завершён',
      'Past poll Завершён',
      'Опрос #1 Завершён',
    ]);
    expect(pastLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/g/invite-code/polls/past-3/results',
      '/g/invite-code/polls/past-2/results',
      '/g/invite-code/polls/past-1/results',
    ]);
    expect(pastLinks.every((link) => !link.classList.contains('bg-emerald-50'))).toBe(true);
    expect(pastSection?.querySelector('ul')?.classList.contains('max-h-64')).toBe(true);
    expect(pastSection?.querySelector('ul')?.classList.contains('overflow-y-auto')).toBe(true);
    expect(pastSection?.querySelector('a')?.className).toContain('focus-visible:');
  });

  it('refreshes participant states before opening the close confirmation', async () => {
    const me = { id: 'self', displayName: 'Alex', avatarColor: 'green' as const };
    const { page, group } = await createPage(
      false,
      undefined,
      [poll({ id: 'open', sequenceNo: 1, status: 'OPEN' })],
      [],
      me,
    );
    group.refreshWorkspace.mockResolvedValue({
      ...group.workspace(),
      participants: [
        { ...me, currentPollState: 'CONFIRMED' },
        { id: 'other', displayName: 'Sam', avatarColor: 'blue', currentPollState: 'DRAFT' },
      ],
    });

    await page.closePoll();

    expect(group.refreshWorkspace).toHaveBeenCalledOnce();
    expect(page.confirmationPendingResponseCount()).toBe(1);
  });

  it('shows zero pending responses when no draft responses remain', async () => {
    const active = poll({ id: 'active-poll', sequenceNo: 1, status: 'OPEN' });
    const me = { id: 'self', displayName: 'Alex', avatarColor: 'green' as const };
    const participants = [
      { ...me, currentPollState: 'CONFIRMED' as const },
      {
        id: 'other',
        displayName: 'Sam',
        avatarColor: 'blue' as const,
        currentPollState: 'NONE' as const,
      },
    ];
    const { page } = await createPage(false, undefined, [active], participants, me);

    await page.closePoll();

    expect(page.confirmationPendingResponseCount()).toBe(0);
  });

  it('shows the current-poll empty state when only closed polls remain', async () => {
    const { fixture } = await createPage(false, undefined, [
      poll({ id: 'past', sequenceNo: 1, createdAt: '2026-10-01T00:00:00.000Z', status: 'CLOSED' }),
    ]);
    const currentSection = [
      ...fixture.nativeElement.querySelectorAll('app-group-sidebar section'),
    ].find(
      (section: Element) => section.querySelector('h3')?.textContent.trim() === 'Текущий опрос',
    );

    expect(currentSection?.textContent).toContain('Сейчас нет текущего опроса.');
    expect(currentSection?.querySelector('a')).toBeNull();
  });

  it('shows empty states and a create-poll action when the group has no polls', async () => {
    const member = { id: 'self', displayName: 'Alex', avatarColor: 'green' as const };
    const { fixture } = await createPage(false, undefined, [], [], member);
    const pollSections = [...fixture.nativeElement.querySelectorAll('app-group-sidebar section')];
    const sectionText = pollSections.map((section: Element) => section.textContent);

    expect(sectionText.some((text: string) => text.includes('Текущий опрос'))).toBe(true);
    expect(sectionText.some((text: string) => text.includes('Сейчас нет текущего опроса.'))).toBe(
      true,
    );
    expect(sectionText.some((text: string) => text.includes('Завершённые опросы'))).toBe(true);
    expect(sectionText.some((text: string) => text.includes('Пока нет прошедших опросов.'))).toBe(
      true,
    );
    const createPollLink = [...fixture.nativeElement.querySelectorAll('a')].find((link) =>
      link.textContent.includes('Создать опрос'),
    );
    expect(createPollLink?.getAttribute('href')).toBe('/g/invite-code/polls/new');
  });

  it('links only the current participant to the active profile and shows avatar colors', async () => {
    const me = { id: 'self', displayName: 'Alex', avatarColor: 'purple' as const };
    const { fixture } = await createPage(
      false,
      undefined,
      [],
      [
        { ...me, currentPollState: 'NONE' },
        {
          id: 'other',
          displayName: 'Sam',
          avatarColor: 'yellow',
          currentPollState: 'NONE',
        },
      ],
      me,
    );
    const cards = [...fixture.nativeElement.querySelectorAll('app-group-participant')];
    const selfLink = cards[0].querySelector('a');
    const otherCard = cards[1];

    expect(selfLink?.getAttribute('href')).toBe('/g/invite-code/profile');
    expect(selfLink?.getAttribute('aria-current')).toBe('page');
    expect(cards[0].querySelector('[data-avatar-color="purple"]')).not.toBeNull();
    expect(otherCard.querySelector('a')).toBeNull();
    expect(otherCard.textContent).toContain('Sam');
    expect(otherCard.querySelector('[data-avatar-color="yellow"]')).not.toBeNull();
    expect(
      otherCard.querySelector('[data-participant-card]')?.classList.contains('opacity-60'),
    ).toBe(true);
  });

  it('keeps the empty participant state in the sidebar', async () => {
    const { fixture } = await createPage(false);

    expect(
      fixture.nativeElement.querySelector('app-group-participant-list')?.textContent,
    ).toContain('Пока нет участников.');
  });

  it('saves local edits, warns about pending responses, closes and opens results', async () => {
    const active = poll({ id: 'active-poll', sequenceNo: 2, status: 'OPEN' });
    const saveDraft = vi.fn().mockResolvedValue(undefined);
    const closePoll = vi.fn().mockReturnValue(of({ poll: active }));
    const me = { id: 'self', displayName: 'Alex', avatarColor: 'green' as const };
    const { page, editor, dialog, group, navigate } = await createPage(
      true,
      saveDraft,
      [active],
      [
        { ...me, currentPollState: 'DRAFT' },
        { id: 'pending', displayName: 'Sam', avatarColor: 'blue', currentPollState: 'NONE' },
        {
          id: 'confirmed',
          displayName: 'Lee',
          avatarColor: 'rose',
          currentPollState: 'CONFIRMED',
        },
      ],
      me,
      true,
      closePoll,
    );

    await page.closePoll();

    expect(page.confirmationPendingResponseCount()).toBe(1);
    expect(editor.saveNow).toHaveBeenCalledOnce();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(editor.saveNow.mock.invocationCallOrder[0]).toBeLessThan(
      dialog.open.mock.invocationCallOrder[0],
    );
    expect(closePoll).toHaveBeenCalledWith('invite-code', 'active-poll', 'secret');
    expect(group.reload).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code', 'polls', 'active-poll', 'results']);
  });

  it('keeps the poll open when closing is cancelled', async () => {
    const active = poll({ id: 'active-poll', sequenceNo: 2, status: 'OPEN' });
    const closePoll = vi.fn().mockReturnValue(of({ poll: active }));
    const { page, group, navigate } = await createPage(
      false,
      undefined,
      [active],
      [],
      { id: 'self', displayName: 'Alex', avatarColor: 'green' },
      false,
      closePoll,
    );

    await page.closePoll();

    expect(closePoll).not.toHaveBeenCalled();
    expect(group.reload).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not open the close dialog when pending edits fail to save', async () => {
    const active = poll({ id: 'active-poll', sequenceNo: 1, status: 'OPEN' });
    const saveDraft = vi.fn().mockRejectedValue(new Error('offline'));
    const closePoll = vi.fn().mockReturnValue(of({ poll: active }));
    const me = { id: 'self', displayName: 'Alex', avatarColor: 'green' as const };
    const { page, dialog } = await createPage(true, saveDraft, [active], [], me, true, closePoll);

    await page.closePoll();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(closePoll).not.toHaveBeenCalled();
    expect(page.closeError()).toContain('сохранить');
  });
});
