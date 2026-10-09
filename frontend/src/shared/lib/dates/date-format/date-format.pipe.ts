import { Pipe, PipeTransform } from '@angular/core';
import {
  formatCalendarDate,
  formatInstantDate,
  formatInstantDateTime,
  formatInstantTime,
  formatInstantWeekday,
} from '../date.utils';

export type DateFormat =
  'calendar-short' | 'calendar-long' | 'short' | 'long' | 'time' | 'weekday' | 'date-time';

const formatters: Record<DateFormat, (value: string, timeZone: string) => string> = {
  'calendar-short': (value) => formatCalendarDate(value, 'short'),
  'calendar-long': (value) => formatCalendarDate(value, 'long'),
  short: (value, timeZone) => formatInstantDate(value, timeZone, 'short'),
  long: (value, timeZone) => formatInstantDate(value, timeZone, 'long'),
  time: formatInstantTime,
  weekday: formatInstantWeekday,
  'date-time': formatInstantDateTime,
};

@Pipe({ name: 'dateFormat' })
export class DateFormatPipe implements PipeTransform {
  transform(value: string, format: DateFormat, timeZone = 'UTC'): string {
    return formatters[format](value, timeZone);
  }
}
