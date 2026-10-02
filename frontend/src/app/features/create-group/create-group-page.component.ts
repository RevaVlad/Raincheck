import { Component } from '@angular/core';
import { inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RaincheckApiService } from '../../core/api/raincheck-api.service';
import { ParticipantSessionService } from '../../core/session/participant-session.service';

@Component({
  selector: 'app-create-group-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './create-group-page.component.html',
  styleUrl: './create-group-page.component.css',
})
export class CreateGroupPageComponent {
  private readonly api = inject(RaincheckApiService);
  private readonly session = inject(ParticipantSessionService);
  private readonly router = inject(Router);
  readonly submitting = signal(false);
  readonly created = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = new FormGroup({
    groupName: new FormControl('Встречи команды CRM'),
    creatorName: new FormControl('Влад'),
    startsOn: new FormControl('2026-10-06'),
    endsOn: new FormControl('2026-10-12'),
    dayStart: new FormControl('16:00'),
    dayEnd: new FormControl('23:00'),
    slotMinutes: new FormControl('30'),
  });

  async submit(): Promise<void> {
    if (this.submitting() || this.created()) return;
    const value = this.form.getRawValue();
    if (
      !value.groupName?.trim() ||
      !value.creatorName?.trim() ||
      !value.startsOn ||
      !value.endsOn ||
      !value.dayStart ||
      !value.dayEnd
    ) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const result = await firstValueFrom(
        this.api.createGroup({
          name: value.groupName,
          creatorDisplayName: value.creatorName,
          timezone: 'UTC',
          firstPoll: {
            title: null,
            startsOn: value.startsOn,
            endsOn: value.endsOn,
            dayStart: value.dayStart,
            dayEnd: value.dayEnd,
            slotMinutes: Number(value.slotMinutes) as 30 | 60,
            meetingDurationMinutes: 60,
          },
        }),
      );
      this.created.set(true);
      if (
        !this.session.store(result.group.inviteCode, {
          participantId: result.participant.id,
          token: result.participantEditToken,
        })
      ) {
        this.errorMessage.set(
          'The group was created, but this browser could not store participant access. It cannot be recovered after this page closes.',
        );
        return;
      }
      await this.router.navigate(['/g', result.group.inviteCode]);
    } catch (error) {
      this.errorMessage.set(RaincheckApiService.errorMessage(error, 'Could not create the group.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
