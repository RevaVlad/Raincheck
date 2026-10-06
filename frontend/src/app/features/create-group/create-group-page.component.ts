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
  'groupName' | 'startsOn' | 'endsOn' | 'dayStart' | 'dayEnd' | 'slotMinutes'
> & {
  groupName: string;
  startsOn: string;
  endsOn: string;
  dayStart: string;
  dayEnd: string;
  slotMinutes: string;
};

function defaultPollDates(): [string, string] {
  const startsOn = new Date();
  startsOn.setUTCDate(startsOn.getUTCDate() + 1);
  const endsOn = new Date(startsOn);
  endsOn.setUTCDate(endsOn.getUTCDate() + 6);
  return [startsOn.toISOString().slice(0, 10), endsOn.toISOString().slice(0, 10)];
}

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
  private readonly pollDates = defaultPollDates();
  readonly submitting = signal(false);
  readonly created = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = new FormGroup({
    groupName: new FormControl(''),
    startsOn: new FormControl(this.pollDates[0]),
    endsOn: new FormControl(this.pollDates[1]),
    dayStart: new FormControl('16:00'),
    dayEnd: new FormControl('23:00'),
    slotMinutes: new FormControl('30'),
  });

  async submit(): Promise<void> {
    if (this.submitting() || this.created()) return;
    const value = this.form.getRawValue();
    if (!this.hasRequiredFields(value)) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Заполните все обязательные поля.');
      return;
    }
    const scheduleError = this.scheduleError(value);
    if (scheduleError) {
      this.form.markAllAsTouched();
      this.errorMessage.set(scheduleError);
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
      this.errorMessage.set(apiErrorMessage(error, 'Не удалось создать группу.'));
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
      !!value.dayEnd &&
      (value.slotMinutes === '30' || value.slotMinutes === '60')
    );
  }

  private scheduleError(value: ValidCreateGroupValues): string | null {
    const startsOn = Date.parse(`${value.startsOn}T00:00:00Z`);
    const endsOn = Date.parse(`${value.endsOn}T00:00:00Z`);
    const days = (endsOn - startsOn) / 86_400_000 + 1;
    if (!Number.isInteger(days) || days < 1 || days > 7) {
      return 'Первый опрос должен охватывать от 1 до 7 дней.';
    }

    const [startHour, startMinute] = value.dayStart.split(':').map(Number);
    const [endHour, endMinute] = value.dayEnd.split(':').map(Number);
    const windowMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (windowMinutes < 60) {
      return 'Конец окна должен быть позже начала и оставлять не менее 60 минут.';
    }
    if (value.slotMinutes !== '30' && value.slotMinutes !== '60') {
      return 'Выберите шаг сетки: 30 или 60 минут.';
    }

    return null;
  }
}
