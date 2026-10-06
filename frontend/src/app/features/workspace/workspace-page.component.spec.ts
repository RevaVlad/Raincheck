import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationCancel, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import type { Poll } from '../../core/api/api.types';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { GroupFacade } from '../group/group.facade';
import { PollEditorService } from './poll-editor/poll-editor.service';
import { WorkspacePageComponent } from './workspace-page.component';

describe('WorkspacePageComponent leave checks', () => {
  async function createPage(
    pending = true,
    saveDraft: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
    polls: Poll[] = [],
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
        polls,
        currentPoll: null,
      }),
      registerLeaveCheck: vi.fn(() => () => {}),
    };
    await TestBed.configureTestingModule({
      imports: [WorkspacePageComponent],
      providers: [
        provideRouter([]),
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
    return { page: fixture.componentInstance, editor, routerEvents, fixture };
  }

  function poll(
    values: Pick<Poll, 'id' | 'sequenceNo' | 'createdAt' | 'status'> & Partial<Poll>,
  ): Poll {
    return {
      startsOn: '2026-11-01',
      endsOn: '2026-11-01',
      dayStart: '09:00',
      dayEnd: '10:00',
      slotMinutes: 30,
      meetingDurationMinutes: 60,
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
    const pastSection = sectionByHeading('Прошедшие опросы');
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

  it('shows empty states when the group has no polls', async () => {
    const { fixture } = await createPage(false);
    const pollSections = [...fixture.nativeElement.querySelectorAll('app-group-sidebar section')];
    const sectionText = pollSections.map((section: Element) => section.textContent);

    expect(sectionText.some((text: string) => text.includes('Текущий опрос'))).toBe(true);
    expect(sectionText.some((text: string) => text.includes('Сейчас нет текущего опроса.'))).toBe(
      true,
    );
    expect(sectionText.some((text: string) => text.includes('Прошедшие опросы'))).toBe(true);
    expect(sectionText.some((text: string) => text.includes('Пока нет прошедших опросов.'))).toBe(
      true,
    );
  });
});
