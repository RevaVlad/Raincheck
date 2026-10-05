import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { NavigationCancel, NavigationError, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import type { Poll, Workspace } from '../../core/api/api.types';
import { GroupFacade } from '../group/group.facade';
import { GroupSidebarComponent } from './group-sidebar/group-sidebar.component';
import { PollEditorComponent } from './poll-editor/poll-editor.component';
import { PollEditorService } from './poll-editor/poll-editor.service';

@Component({
  selector: 'app-workspace-page',
  imports: [GroupSidebarComponent, PollEditorComponent, RouterLink, TimezoneDisplayPipe],
  providers: [PollEditorService],
  templateUrl: './workspace-page.component.html',
})
export class WorkspacePageComponent {
  readonly group = inject(GroupFacade);
  readonly workspace = computed<Workspace>(() => {
    const workspace = this.group.workspace();
    if (!workspace) throw new Error('Workspace data is not available.');
    return workspace;
  });
  readonly currentPoll = computed(() => this.group.workspace()?.currentPoll ?? null);
  readonly inviteLink = computed(
    () =>
      `${this.document.location?.origin ?? ''}/g/${encodeURIComponent(this.group.inviteCode())}`,
  );

  private readonly document = inject(DOCUMENT);
  private readonly session = inject(ParticipantSessionService);
  private readonly editor = inject(PollEditorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly timezone = inject(TimezonePreferenceService);
  private leaveAttempt: Promise<boolean> | null = null;

  constructor() {
    const unregisterLeaveCheck = this.group.registerLeaveCheck(() => this.canLeave());
    this.destroyRef.onDestroy(unregisterLeaveCheck);
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationCancel || event instanceof NavigationError),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.editor.cancelLeaving());

    effect(() => {
      const inviteCode = this.group.inviteCode();
      const poll = this.currentPoll();
      if (!inviteCode || !poll || !this.group.workspace()?.me) return;
      void this.loadEditor(inviteCode, poll);
    });
  }

  canLeave(): Promise<boolean> {
    if (!this.editor.pendingChanges()) return Promise.resolve(true);
    if (this.leaveAttempt) return this.leaveAttempt;

    const attempt = this.editor
      .saveNow()
      .then(() => {
        this.editor.beginLeaving();
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (this.leaveAttempt === attempt) this.leaveAttempt = null;
      });
    this.leaveAttempt = attempt;
    return attempt;
  }

  private async loadEditor(inviteCode: string, poll: Poll): Promise<void> {
    await this.timezone.ensureConfirmed();
    if (!this.isCurrentEditorContext(inviteCode, poll)) return;
    const identity = this.session.get(inviteCode);
    if (!identity) return;
    void this.editor.load(inviteCode, poll, identity.token, () =>
      this.group.invalidateIdentity(inviteCode),
    );
  }

  private isCurrentEditorContext(inviteCode: string, poll: Poll): boolean {
    return (
      inviteCode === this.group.inviteCode() &&
      this.currentPoll()?.id === poll.id &&
      !!this.group.workspace()?.me
    );
  }
}
