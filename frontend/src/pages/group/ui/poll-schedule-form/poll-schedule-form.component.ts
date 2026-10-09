import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { Poll, PollInput } from '@shared/api';
import { BrowserTimeZoneService } from '@shared/lib/dates';
import { addCalendarDays, localCalendarDate, localScheduleTime } from '@shared/lib/dates';

function defaultPollDates(timeZone: string): [string, string] {
  const startsOn = addCalendarDays(localCalendarDate(new Date().toISOString(), timeZone), 1);
  return [startsOn, addCalendarDays(startsOn, 6)];
}

function minuteOfDay(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

@Component({
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  selector: 'app-poll-schedule-form',
  templateUrl: './poll-schedule-form.component.html',
})
export class PollScheduleFormComponent {
  private readonly timezone = inject(BrowserTimeZoneService);
  readonly previousPoll = input<Poll | null>(null);
  readonly submitting = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly save = output<PollInput>();
  readonly validationError = signal<string | null>(null);
  readonly meetingDurations = [30, 60, 90, 120, 150, 180, 210, 240];
  readonly form = this.createForm();
  private copiedSchedule = false;

  constructor() {
    effect(() => {
      const poll = this.previousPoll();
      if (this.copiedSchedule || !poll) return;
      this.form.patchValue({
        dayStart: localScheduleTime(
          poll.startsOn,
          poll.dayStart,
          poll.timeZone,
          poll.createdAt,
          this.timezone.timeZone,
        ),
        dayEnd: localScheduleTime(
          poll.startsOn,
          poll.dayEnd,
          poll.timeZone,
          poll.createdAt,
          this.timezone.timeZone,
        ),
        slotMinutes: poll.slotMinutes,
        meetingDurationMinutes: poll.meetingDurationMinutes,
      });
      this.copiedSchedule = true;
    });
  }

  submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.validationError.set('Заполните даты и время опроса.');
      return;
    }

    const value = this.form.getRawValue();
    const error = this.scheduleError(value);
    if (error) {
      this.validationError.set(error);
      return;
    }

    this.validationError.set(null);
    this.save.emit({
      timeZone: this.timezone.timeZone,
      title: value.title.trim() || null,
      startsOn: value.startsOn,
      endsOn: value.endsOn,
      dayStart: value.dayStart,
      dayEnd: value.dayEnd,
      slotMinutes: value.slotMinutes,
      meetingDurationMinutes: value.meetingDurationMinutes,
    });
  }

  private createForm() {
    const [startsOn, endsOn] = defaultPollDates(this.timezone.timeZone);
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

  private scheduleError(
    value: ReturnType<PollScheduleFormComponent['form']['getRawValue']>,
  ): string | null {
    if (this.hasInvalidDateWindow(value.startsOn, value.endsOn)) {
      return 'Выберите период от 1 до 7 дней.';
    }
    if (minuteOfDay(value.dayEnd) - minuteOfDay(value.dayStart) < value.meetingDurationMinutes) {
      return 'Окно времени должно быть не короче длительности встречи.';
    }
    if (this.hasInvalidSlotStep(value.slotMinutes)) {
      return 'Шаг сетки должен быть 30 или 60 минут.';
    }
    if (this.hasInvalidMeetingDuration(value.meetingDurationMinutes, value.slotMinutes)) {
      return 'Выберите длительность встречи, кратную шагу сетки.';
    }
    return null;
  }

  private hasInvalidDateWindow(startsOn: string, endsOn: string): boolean {
    const startDate = Date.parse(`${startsOn}T00:00:00Z`);
    const endDate = Date.parse(`${endsOn}T00:00:00Z`);
    const dayCount = (endDate - startDate) / 86_400_000 + 1;
    return !Number.isInteger(dayCount) || dayCount < 1 || dayCount > 7;
  }

  private hasInvalidSlotStep(slotMinutes: number): boolean {
    return slotMinutes !== 30 && slotMinutes !== 60;
  }

  private hasInvalidMeetingDuration(duration: number, slotMinutes: number): boolean {
    return !this.meetingDurations.includes(duration) || duration % slotMinutes !== 0;
  }
}
