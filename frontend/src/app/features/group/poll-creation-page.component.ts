import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorCode, apiErrorMessage } from '../../core/api/api-errors';
import type { PollInput, Workspace } from '../../core/api/api.types';
import {
  ParticipantSessionService,
  type ParticipantIdentity,
} from '../../core/session/participant-session.service';
import { ErrorStateComponent } from '../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../shared/presentation/loading-state.component';
import { GroupFacade } from './group.facade';
import { PollsApiService } from './polls-api.service';
import { PollScheduleFormComponent } from './poll-schedule-form.component';

@Component({
  selector: 'app-poll-creation-page',
  imports: [MatCardModule, PollScheduleFormComponent, ErrorStateComponent, LoadingStateComponent],
  templateUrl: './poll-creation-page.component.html',
})
export class PollCreationPageComponent {
  readonly group = inject(GroupFacade);
  readonly workspace = computed(() => this.group.workspace());
  readonly ready = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly session = inject(ParticipantSessionService);
  private readonly api = inject(PollsApiService);
  private readonly router = inject(Router);
  private redirected = false;
  readonly previousPoll = computed(
    () =>
      this.workspace()
        ?.polls.filter((poll) => poll.status === 'CLOSED')
        .sort((a, b) => b.sequenceNo - a.sequenceNo)[0] ?? null,
  );

  constructor() {
    effect(() => this.validateGroupAccess());
  }

  async submitInput(input: PollInput): Promise<void> {
    const inviteCode = this.group.inviteCode();
    const identity = this.session.get(inviteCode);
    if (!identity || identity.participantId !== this.workspace()?.me?.id) {
      this.redirect(['/g', inviteCode, 'profile']);
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.createPoll(inviteCode, identity, input);
    } catch (error) {
      this.handleCreateError(error, inviteCode);
    } finally {
      this.submitting.set(false);
    }
  }

  private async createPoll(
    inviteCode: string,
    identity: ParticipantIdentity,
    input: PollInput,
  ): Promise<void> {
    await firstValueFrom(this.api.createPoll(inviteCode, input, identity.token));
    this.group.reload();
    await this.router.navigate(['/g', inviteCode]);
  }

  private handleCreateError(error: unknown, inviteCode: string): void {
    const code = apiErrorCode(error);
    if (code === 'POLL_STATE_CONFLICT') {
      this.group.reload();
      this.errorMessage.set('В группе уже появился активный опрос. Откройте его в группе.');
      return;
    }
    if (code === 'UNAUTHORIZED') this.group.invalidateIdentity(inviteCode);
    this.errorMessage.set(apiErrorMessage(error, 'Не удалось создать опрос.'));
  }

  private validateGroupAccess(): void {
    const inviteCode = this.group.inviteCode();
    if (!inviteCode || this.groupUnavailable()) return;
    const workspace = this.workspace();
    if (!workspace) return;
    if (!this.hasCurrentParticipant(inviteCode, workspace.me)) {
      this.redirect(['/g', inviteCode, 'profile']);
      return;
    }
    if (workspace.currentPoll) {
      this.redirect(['/g', inviteCode]);
      return;
    }

    this.ready.set(true);
  }

  private groupUnavailable(): boolean {
    return this.group.loading() || this.group.notFound() || !!this.group.loadError();
  }

  private hasCurrentParticipant(inviteCode: string, participant: Workspace['me']): boolean {
    const identity = this.session.get(inviteCode);
    return !!participant && identity?.participantId === participant.id;
  }

  private redirect(commands: string[]): void {
    if (this.redirected) return;
    this.redirected = true;
    void this.router.navigate(commands);
  }
}
