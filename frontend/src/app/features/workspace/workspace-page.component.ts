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

interface EditorContext {
  inviteCode: string;
  poll: Poll;
}

@Component({
  selector: 'app-workspace-page',
  imports: [GroupSidebarComponent, PollEditorComponent, RouterLink, TimezoneDisplayPipe],
  providers: [PollEditorService],
  templateUrl: './workspace-page.component.html',
})
export class WorkspacePageComponent {
  readonly group = inject(GroupFacade);
  readonly timezone = inject(TimezonePreferenceService);

  private readonly document = inject(DOCUMENT);
  private readonly session = inject(ParticipantSessionService);
  private readonly editor = inject(PollEditorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private leaveAttempt: Promise<boolean> | null = null;

  readonly workspace = computed<Workspace>(() => {
    const workspace = this.group.workspace();

    if (!workspace) {
      throw new Error('Workspace data is not available.');
    }

    return workspace;
  });

  readonly currentPoll = computed(() => this.group.workspace()?.currentPoll ?? null);

  readonly inviteLink = computed(
    () =>
      `${this.document.location?.origin ?? ''}/g/${encodeURIComponent(this.group.inviteCode())}`,
  );

  private readonly editorContext = computed<EditorContext | null>(() => {
    const inviteCode = this.group.inviteCode();
    const workspace = this.group.workspace();
    const poll = workspace?.currentPoll;

    if (!inviteCode || !workspace?.me || !poll) {
      return null;
    }

    return {
      inviteCode,
      poll,
    };
  });

  constructor() {
    this.registerLeaveCheck();
    this.watchCancelledNavigation();
    this.watchEditorContext();
  }

  canLeave(): Promise<boolean> {
    if (!this.editor.pendingChanges()) {
      return Promise.resolve(true);
    }

    return (this.leaveAttempt ??= this.saveBeforeLeaving());
  }

  private registerLeaveCheck(): void {
    const unregister = this.group.registerLeaveCheck(() => this.canLeave());

    this.destroyRef.onDestroy(unregister);
  }

  private watchCancelledNavigation(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationCancel || event instanceof NavigationError),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.editor.cancelLeaving());
  }

  private watchEditorContext(): void {
    effect((onCleanup) => {
      const context = this.editorContext();

      if (!context) {
        return;
      }

      let cancelled = false;

      onCleanup(() => {
        cancelled = true;
      });

      void this.loadEditor(context, () => cancelled);
    });
  }

  private async saveBeforeLeaving(): Promise<boolean> {
    try {
      await this.editor.saveNow();

      this.editor.beginLeaving();

      return true;
    } catch {
      return false;
    } finally {
      this.leaveAttempt = null;
    }
  }

  private async loadEditor(
    { inviteCode, poll }: EditorContext,
    isCancelled: () => boolean,
  ): Promise<void> {
    await this.timezone.ensureConfirmed();

    if (isCancelled()) {
      return;
    }

    const identity = this.session.get(inviteCode);

    if (!identity) {
      return;
    }

    void this.editor.load(inviteCode, poll, identity.token, () =>
      this.group.invalidateIdentity(inviteCode),
    );
  }
}
