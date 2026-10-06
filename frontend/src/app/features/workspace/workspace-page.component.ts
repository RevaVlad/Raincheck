import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  TemplateRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationCancel, NavigationError, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, filter } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { apiErrorCode, apiErrorMessage } from '../../core/api/api-errors';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import type { Poll, Workspace, WorkspaceParticipant } from '../../core/api/api.types';
import { GroupFacade } from '../group/group.facade';
import { PollsApiService } from '../group/polls-api.service';
import { GroupSidebarComponent } from './group-sidebar/group-sidebar.component';
import { AvailabilityIntervalsService } from './poll-editor/availability-grid/availability-intervals.service';
import { ConfirmResponseButtonComponent } from './confirm-response-button.component';
import { PollEntryEditorComponent } from './poll-editor/poll-entry-editor.component';
import { PollEditorService } from './poll-editor/poll-editor.service';
import { PollHeaderComponent } from './poll-header.component';

interface EditorContext {
  inviteCode: string;
  poll: Poll;
}

interface PollCloseContext extends EditorContext {
  token: string;
}

@Component({
  selector: 'app-workspace-page',
  imports: [
    GroupSidebarComponent,
    PollHeaderComponent,
    PollEntryEditorComponent,
    ConfirmResponseButtonComponent,
    MatButtonModule,
    MatDialogModule,
    RouterLink,
  ],
  providers: [PollEditorService, AvailabilityIntervalsService],
  templateUrl: './workspace-page.component.html',
})
export class WorkspacePageComponent {
  readonly group = inject(GroupFacade);
  readonly timezone = inject(TimezonePreferenceService);

  private readonly document = inject(DOCUMENT);
  private readonly session = inject(ParticipantSessionService);
  private readonly editor = inject(PollEditorService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly pollsApi = inject(PollsApiService);
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
  readonly closing = signal(false);
  readonly closeError = signal<string | null>(null);
  readonly confirmationPendingResponseCount = signal(0);

  @ViewChild('closePollDialog') private closePollDialog!: TemplateRef<unknown>;

  readonly sidebarParticipants = computed<WorkspaceParticipant[]>(() => {
    const workspace = this.group.workspace();
    if (!workspace) return [];

    const identity = this.session.get(this.group.inviteCode());
    if (!identity || !workspace.currentPoll || !this.editor.responseLoaded()) {
      return workspace.participants;
    }

    const currentPollState = this.editor.responseId() ? this.editor.responseState() : 'NONE';
    return workspace.participants.map((participant) =>
      participant.id === identity.participantId
        ? { ...participant, currentPollState }
        : participant,
    );
  });

  readonly inviteLink = computed(() => {
    const origin = this.document.location?.origin ?? '';
    const inviteCode = encodeURIComponent(this.group.inviteCode());
    return `${origin}/g/${inviteCode}`;
  });

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

  async closePoll(): Promise<void> {
    const context = this.pollCloseContext();
    if (!context) return;

    this.closing.set(true);
    this.closeError.set(null);
    try {
      if (!(await this.savePendingBeforeClose())) return;
      const latestWorkspace = await this.group.refreshWorkspace();
      this.confirmationPendingResponseCount.set(this.pendingCount(latestWorkspace));
      const confirmed = await this.confirmPollClose();
      if (confirmed !== true) return;

      await this.closePollFor(context);
    } catch (error) {
      this.handleCloseError(error, context.inviteCode);
    } finally {
      this.closing.set(false);
    }
  }

  private async savePendingBeforeClose(): Promise<boolean> {
    try {
      await this.editor.saveNow();
      return true;
    } catch {
      this.closeError.set('Не удалось сохранить ваши изменения. Опрос остался открытым.');
      return false;
    }
  }

  private pollCloseContext(): PollCloseContext | null {
    const poll = this.currentPoll();
    const inviteCode = this.group.inviteCode();
    const identity = this.session.get(inviteCode);
    if (!poll || !identity || this.closing()) return null;
    return { poll, inviteCode, token: identity.token };
  }

  private pendingCount(workspace: Workspace): number {
    return workspace.participants.filter((participant) => participant.currentPollState === 'DRAFT')
      .length;
  }

  private confirmPollClose(): Promise<boolean | undefined> {
    return firstValueFrom(
      this.dialog
        .open(this.closePollDialog, {
          ariaLabelledBy: 'close-poll-title',
          ariaDescribedBy: 'close-poll-description',
        })
        .afterClosed(),
    );
  }

  private async closePollFor(context: PollCloseContext): Promise<void> {
    await firstValueFrom(
      this.pollsApi.closePoll(context.inviteCode, context.poll.id, context.token),
    );
    this.group.reload();
    await this.router.navigate(['/g', context.inviteCode, 'polls', context.poll.id, 'results']);
  }

  private handleCloseError(error: unknown, inviteCode: string): void {
    const code = apiErrorCode(error);
    if (code === 'UNAUTHORIZED') this.group.invalidateIdentity(inviteCode);
    this.group.reload();
    this.closeError.set(
      code === 'POLL_STATE_CONFLICT'
        ? 'Опрос уже завершён другим участником. Обновите группу, чтобы открыть результаты.'
        : apiErrorMessage(error, 'Не удалось завершить опрос.'),
    );
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
