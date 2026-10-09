import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Workspace } from '@shared/api';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { GroupSidebarContext } from '../../model/group-sidebar-context/group-sidebar-context.service';
import { GroupShellComponent } from './group-shell.component';

const workspace: Workspace = {
  group: { id: 'group-id', name: 'Team', inviteCode: 'invite-code' },
  me: null,
  participants: [
    {
      id: 'participant-id',
      displayName: 'Alex',
      avatarColor: 'green',
      currentPollState: 'DRAFT',
    },
  ],
  polls: [],
  currentPoll: null,
};

@Component({ standalone: true, template: 'Workspace child' })
class WorkspaceChildComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = inject(GroupSidebarContext);

  constructor() {
    this.destroyRef.onDestroy(
      this.context.setPresentationOverride(() => ({
        participants: workspace.participants.map((participant) => ({
          ...participant,
          currentPollState: 'CONFIRMED',
        })),
      })),
    );
  }
}

@Component({ standalone: true, template: 'Other child' })
class OtherChildComponent {}

describe('GroupShellComponent', () => {
  it('keeps sidebar presentation local to the active child route', async () => {
    const facade = {
      inviteCode: signal('invite-code'),
      workspace: signal(workspace),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'g/:inviteCode',
            component: GroupShellComponent,
            providers: [{ provide: GroupFacade, useValue: facade }],
            children: [
              { path: 'workspace', component: WorkspaceChildComponent },
              { path: 'other', component: OtherChildComponent },
            ],
          },
        ]),
      ],
    });

    const harness = await RouterTestingHarness.create('/g/invite-code/workspace');
    expect(harness.fixture.nativeElement.textContent).toContain('Готово');

    await harness.navigateByUrl('/g/invite-code/other');

    expect(harness.fixture.nativeElement.textContent).toContain('Заполняет');
    expect(harness.fixture.nativeElement.textContent).not.toContain('Готово');
  });
});
