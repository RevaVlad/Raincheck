import { Component, TemplateRef, ViewChild, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { apiErrorCode, apiErrorMessage } from '@shared/api';
import type { Poll, Workspace } from '@shared/api';
import { ParticipantSessionService } from '../../model/participant-session/participant-session.service';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { PollsApiService } from '../../api/polls-api/polls-api.service';
import { PollEditorService } from '@features/respond-to-poll';

interface PollCloseContext {
  inviteCode: string;
  poll: Poll;
  token: string;
}

@Component({
  imports: [MatButtonModule, MatDialogModule],
  selector: 'app-poll-close-control',
  templateUrl: './poll-close-control.component.html',
})
export class PollCloseControlComponent {
  readonly poll = input.required<Poll>();
  readonly closing = signal(false);
  readonly closeError = signal<string | null>(null);
  readonly confirmationPendingResponseCount = signal(0);

  private readonly group = inject(GroupFacade);
  private readonly session = inject(ParticipantSessionService);
  private readonly editor = inject(PollEditorService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly pollsApi = inject(PollsApiService);

  @ViewChild('closePollDialog') private closePollDialog!: TemplateRef<unknown>;

  async closePoll(): Promise<void> {
    const context = this.pollCloseContext();
    if (!context) return;

    this.closing.set(true);
    this.closeError.set(null);
    try {
      if (!(await this.savePendingBeforeClose())) return;
      const latestWorkspace = await this.group.refreshWorkspace();
      this.confirmationPendingResponseCount.set(this.pendingCount(latestWorkspace));
      if ((await this.confirmPollClose()) !== true) return;
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
    const inviteCode = this.group.inviteCode();
    const identity = this.session.get(inviteCode);
    if (!identity || this.closing()) return null;
    return { poll: this.poll(), inviteCode, token: identity.token };
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
}
