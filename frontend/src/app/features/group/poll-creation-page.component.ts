import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
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
import { GroupSidebarComponent } from '../workspace/group-sidebar/group-sidebar.component';

function defaultPollDates(): [string, string] {
  const startsOn = new Date();
  startsOn.setUTCDate(startsOn.getUTCDate() + 1);
  const endsOn = new Date(startsOn);
  endsOn.setUTCDate(endsOn.getUTCDate() + 6);
  return [startsOn.toISOString().slice(0, 10), endsOn.toISOString().slice(0, 10)];
}

function minuteOfDay(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

@Component({
  selector: 'app-poll-creation-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    GroupSidebarComponent,
    ErrorStateComponent,
    LoadingStateComponent,
  ],
  templateUrl: './poll-creation-page.component.html',
})
export class PollCreationPageComponent {
  readonly group = inject(GroupFacade);
  readonly workspace = computed(() => this.group.workspace());
  readonly ready = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly meetingDurations = [30, 60, 90, 120, 150, 180, 210, 240];

  private readonly document = inject(DOCUMENT);
  private readonly session = inject(ParticipantSessionService);
  private readonly api = inject(PollsApiService);
  private readonly router = inject(Router);
  private settingsInitialized = false;
  private redirected = false;

  readonly inviteLink = computed(
    () =>
      `${this.document.location?.origin ?? ''}/g/${encodeURIComponent(this.group.inviteCode())}`,
  );
  readonly form = this.createForm();

  constructor() {
    effect(() => this.validateGroupAccess());
  }

  async submit(): Promise<void> {
    if (this.submitting() || !this.ready()) return;
    const input = this.validatedInput();
    if (!input) return;
    await this.submitInput(input);
  }

  private validatedInput(): PollInput | null {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Заполните даты и время опроса.');
      return null;
    }

    const value = this.form.getRawValue();
    const scheduleError = this.scheduleError(value);
    if (scheduleError) {
      this.errorMessage.set(scheduleError);
      return null;
    }

    return {
      title: value.title.trim() || null,
      startsOn: value.startsOn,
      endsOn: value.endsOn,
      dayStart: value.dayStart,
      dayEnd: value.dayEnd,
      slotMinutes: value.slotMinutes,
      meetingDurationMinutes: value.meetingDurationMinutes,
    };
  }

  private async submitInput(input: PollInput): Promise<void> {
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

  private createForm() {
    const [startsOn, endsOn] = defaultPollDates();
    return new FormGroup({
      title: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
      startsOn: new FormControl(startsOn, { nonNullable: true, validators: [Validators.required] }),
      endsOn: new FormControl(endsOn, { nonNullable: true, validators: [Validators.required] }),
      dayStart: new FormControl('16:00', { nonNullable: true, validators: [Validators.required] }),
      dayEnd: new FormControl('23:00', { nonNullable: true, validators: [Validators.required] }),
      slotMinutes: new FormControl<30 | 60>(30, {
        nonNullable: true,
        validators: [Validators.required],
      }),
      meetingDurationMinutes: new FormControl(60, {
        nonNullable: true,
        validators: [Validators.required],
      }),
    });
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

    this.initializeSettings(workspace.polls);
  }

  private groupUnavailable(): boolean {
    return this.group.loading() || this.group.notFound() || !!this.group.loadError();
  }

  private hasCurrentParticipant(inviteCode: string, participant: Workspace['me']): boolean {
    const identity = this.session.get(inviteCode);
    return !!participant && identity?.participantId === participant.id;
  }

  private initializeSettings(polls: Workspace['polls']): void {
    if (this.settingsInitialized) return;
    const previous = polls
      .filter((poll) => poll.status === 'CLOSED')
      .sort((a, b) => b.sequenceNo - a.sequenceNo)[0];
    if (previous) {
      this.form.patchValue({
        dayStart: previous.dayStart,
        dayEnd: previous.dayEnd,
        slotMinutes: previous.slotMinutes,
        meetingDurationMinutes: previous.meetingDurationMinutes,
      });
    }
    this.settingsInitialized = true;
    this.ready.set(true);
  }

  private scheduleError(
    value: ReturnType<PollCreationPageComponent['form']['getRawValue']>,
  ): string | null {
    if (this.hasInvalidDateWindow(value.startsOn, value.endsOn))
      return 'Выберите период от 1 до 7 дней.';
    if (this.hasInvalidDailyWindow(value))
      return 'Окно времени должно быть не короче длительности встречи.';
    if (this.hasInvalidSlotStep(value.slotMinutes)) return 'Шаг сетки должен быть 30 или 60 минут.';
    if (this.hasInvalidMeetingDuration(value.meetingDurationMinutes, value.slotMinutes))
      return 'Выберите длительность встречи, кратную шагу сетки.';
    return null;
  }

  private hasInvalidDateWindow(startsOn: string, endsOn: string): boolean {
    const startDate = Date.parse(`${startsOn}T00:00:00Z`);
    const endDate = Date.parse(`${endsOn}T00:00:00Z`);
    const dayCount = (endDate - startDate) / 86_400_000 + 1;
    return !Number.isInteger(dayCount) || dayCount < 1 || dayCount > 7;
  }

  private hasInvalidDailyWindow(
    value: ReturnType<PollCreationPageComponent['form']['getRawValue']>,
  ): boolean {
    return minuteOfDay(value.dayEnd) - minuteOfDay(value.dayStart) < value.meetingDurationMinutes;
  }

  private hasInvalidSlotStep(slotMinutes: number): boolean {
    return slotMinutes !== 30 && slotMinutes !== 60;
  }

  private hasInvalidMeetingDuration(duration: number, slotMinutes: number): boolean {
    return !this.meetingDurations.includes(duration) || duration % slotMinutes !== 0;
  }

  private redirect(commands: string[]): void {
    if (this.redirected) return;
    this.redirected = true;
    void this.router.navigate(commands);
  }
}
