import { Pipe, PipeTransform, inject } from '@angular/core';
import { TimezonePreferenceService } from './timezone-preference.service';

type TimezoneDisplayFormat = 'date' | 'time' | 'offset' | 'weekday' | 'slot';

@Pipe({ name: 'timezoneDisplay' })
export class TimezoneDisplayPipe implements PipeTransform {
  private readonly timezone = inject(TimezonePreferenceService);

  transform(
    utcDate: string,
    selectedTimeZone: string,
    format: TimezoneDisplayFormat = 'date',
    startTime = '00:00',
    endTime?: string,
  ): string {
    const start = this.timezone.convertUtc(utcDate, startTime, selectedTimeZone);
    switch (format) {
      case 'date':
        return this.timezone.formatDate(start.localDate);
      case 'time':
        return start.localTime;
      case 'offset':
        return start.offset;
      case 'weekday':
        return new Intl.DateTimeFormat('ru-RU', {
          weekday: 'short',
          timeZone: 'UTC',
        }).format(new Date(`${start.localDate}T12:00:00Z`));
      case 'slot': {
        if (!endTime) return '';
        const end = this.timezone.convertUtc(utcDate, endTime, selectedTimeZone);
        const date =
          start.localDate === end.localDate
            ? this.timezone.formatDate(start.localDate)
            : `${this.timezone.formatDate(start.localDate)} — ${this.timezone.formatDate(end.localDate)}`;
        const offset = start.offset === end.offset ? start.offset : `${start.offset}–${end.offset}`;
        return `${date}, ${start.localTime}–${end.localTime} ${offset}`;
      }
    }
  }
}
