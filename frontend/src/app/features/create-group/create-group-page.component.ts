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
import { apiErrorMessage } from '../../core/api/api-errors';
import { GroupsApiService } from '../group/groups-api.service';

type CreateGroupValues = {
  groupName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  dayStart: string | null;
  dayEnd: string | null;
  slotMinutes: string | null;
};

type ValidCreateGroupValues = Omit<
  CreateGroupValues,
  'groupName' | 'startsOn' | 'endsOn' | 'dayStart' | 'dayEnd'
> & {
  groupName: string;
  startsOn: string;
  endsOn: string;
  dayStart: string;
  dayEnd: string;
};

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
  private readonly api = inject(GroupsApiService);
  private readonly router = inject(Router);
  readonly submitting = signal(false);
  readonly created = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = new FormGroup({
    groupName: new FormControl('Встречи команды CRM'),
    startsOn: new FormControl('2026-10-06'),
    endsOn: new FormControl('2026-10-12'),
    dayStart: new FormControl('16:00'),
    dayEnd: new FormControl('23:00'),
    slotMinutes: new FormControl('30'),
  });

  async submit(): Promise<void> {
    if (this.submitting() || this.created()) return;
    const value = this.form.getRawValue();
    if (!this.hasRequiredFields(value)) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const result = await firstValueFrom(
        this.api.createGroup({
          name: value.groupName,
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
      await this.router.navigate(['/g', result.group.inviteCode, 'profile']);
    } catch (error) {
      this.errorMessage.set(apiErrorMessage(error, 'Could not create the group.'));
    } finally {
      this.submitting.set(false);
    }
  }

  private hasRequiredFields(value: CreateGroupValues): value is ValidCreateGroupValues {
    return (
      !!value.groupName?.trim() &&
      !!value.startsOn &&
      !!value.endsOn &&
      !!value.dayStart &&
      !!value.dayEnd
    );
  }
}
