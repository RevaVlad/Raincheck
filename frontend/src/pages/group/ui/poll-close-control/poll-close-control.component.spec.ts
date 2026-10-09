import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import type { WorkspacePoll, Workspace } from '@shared/api';
import { ParticipantSessionService } from '../../model/participant-session/participant-session.service';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { PollsApiService } from '../../api/polls-api/polls-api.service';
import { PollEditorService } from '@features/respond-to-poll';
import { PollCloseControlComponent } from './poll-close-control.component';

const poll: WorkspacePoll = {
  id: 'open-poll',
  sequenceNo: 1,
  title: null,
  timeZone: 'UTC',
  startsOn: '2026-10-01',
  endsOn: '2026-10-07',
  dayStart: '09:00',
  dayEnd: '10:00',
  slotMinutes: 30,
  meetingDurationMinutes: 30,
  status: 'OPEN',
  basedOnPollId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  closedAt: null,
  slots: [],
};

describe('PollCloseControlComponent', () => {
  async function setup(saveNow = vi.fn().mockResolvedValue(undefined), confirm = true) {
    const workspace: Workspace = {
      group: { id: 'group', name: 'Team', inviteCode: 'invite-code' },
      me: { id: 'self', displayName: 'Alex', avatarColor: 'green' },
      participants: [],
      polls: [poll],
      currentPoll: poll,
    };
    const group = {
      inviteCode: signal('invite-code'),
      workspace: signal(workspace),
      refreshWorkspace: vi.fn().mockResolvedValue(workspace),
      reload: vi.fn(),
      invalidateIdentity: vi.fn(),
    };
    const closePoll = vi.fn().mockReturnValue(of({ poll }));
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(confirm) })) };
    await TestBed.configureTestingModule({
      imports: [PollCloseControlComponent],
      providers: [
        provideRouter([]),
        { provide: GroupFacade, useValue: group },
        { provide: PollEditorService, useValue: { saveNow } },
        { provide: ParticipantSessionService, useValue: { get: () => ({ token: 'secret' }) } },
        { provide: PollsApiService, useValue: { closePoll } },
      ],
    })
      .overrideComponent(PollCloseControlComponent, {
        set: { providers: [{ provide: MatDialog, useValue: dialog }] },
      })
      .compileComponents();
    const fixture = TestBed.createComponent(PollCloseControlComponent);
    fixture.componentRef.setInput('poll', poll);
    fixture.detectChanges();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return { fixture, component: fixture.componentInstance, group, closePoll, dialog, navigate };
  }

  it('saves, confirms, closes, and opens results in order', async () => {
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { component, group, closePoll, dialog, navigate } = await setup(saveNow);

    await component.closePoll();

    expect(saveNow).toHaveBeenCalledOnce();
    expect(group.refreshWorkspace).toHaveBeenCalledOnce();
    expect(component.closeError()).toBeNull();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(closePoll).toHaveBeenCalledWith('invite-code', 'open-poll', 'secret');
    expect(group.reload).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/g', 'invite-code', 'polls', 'open-poll', 'results']);
  });

  it('leaves the poll open when saving edits fails', async () => {
    const saveNow = vi.fn().mockRejectedValue(new Error('offline'));
    const { component, closePoll, dialog } = await setup(saveNow);

    await component.closePoll();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(closePoll).not.toHaveBeenCalled();
    expect(component.closeError()).toContain('сохранить');
  });
});
