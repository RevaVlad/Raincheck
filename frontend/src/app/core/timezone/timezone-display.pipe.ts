import { Pipe, PipeTransform } from '@angular/core';
import {
  convertUtcToLocalSlot,
  formatLocalDate,
  formatWeekday,
  type LocalSlot,
} from './timezone.utils';

type TimezoneDisplayFormat = 'date' | 'time' | 'offset' | 'weekday' | 'slot';

@Pipe({ name: 'timezoneDisplay' })
export class TimezoneDisplayPipe implements PipeTransform {
  transform(
    utcDate: string,
    selectedTimeZone: string,
    format: TimezoneDisplayFormat = 'date',
    startTime = '00:00',
    endTime?: string,
  ): string {
    const start = convertUtcToLocalSlot(utcDate, startTime, selectedTimeZone);
    if (format === 'slot') {
      return this.formatSlot(utcDate, selectedTimeZone, start, endTime);
    }
    switch (format) {
      case 'date':
        return formatLocalDate(start.localDate, 'UTC');
      case 'time':
        return start.localTime;
      case 'offset':
        return start.offset;
      case 'weekday':
        return formatWeekday(start.localDate, 'UTC');
    }
  }

  private formatSlot(
    utcDate: string,
    timeZone: string,
    start: LocalSlot,
    endTime?: string,
  ): string {
    if (!endTime) return '';
    const end = convertUtcToLocalSlot(utcDate, endTime, timeZone);
    const startDate = formatLocalDate(start.localDate, 'UTC');
    const endDate = formatLocalDate(end.localDate, 'UTC');
    const date = start.localDate === end.localDate ? startDate : `${startDate} — ${endDate}`;
    const offset = start.offset === end.offset ? start.offset : `${start.offset}–${end.offset}`;
    return `${date}, ${start.localTime}–${end.localTime} ${offset}`;
  }
}
