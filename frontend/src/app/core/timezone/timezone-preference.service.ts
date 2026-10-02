import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'raincheck.timezone';

export interface LocalSlot {
  localDate: string;
  localTime: string;
  offset: string;
}

@Injectable({ providedIn: 'root' })
export class TimezonePreferenceService {
  readonly promptOpen = signal(false);
  readonly selectedTimeZone = signal(this.detectTimeZone());
  readonly timeZones = this.listTimeZones();
  private resolvers: Array<(timeZone: string) => void> = [];
  private readonly formatters = new Map<string, Intl.DateTimeFormat>();

  async ensureConfirmed(): Promise<string> {
    const saved = this.readSavedTimeZone();
    if (saved) return saved;
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
      this.promptOpen.set(true);
    });
  }

  confirm(): string {
    const value = isTimeZone(this.selectedTimeZone()) ? this.selectedTimeZone() : 'UTC';
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* Storage may be disabled. */
    }
    this.promptOpen.set(false);
    this.resolvers.splice(0).forEach((resolve) => resolve(value));
    return value;
  }

  convertUtc(
    localDate: string,
    localTime: string,
    timeZone = this.readSavedTimeZone() ?? this.selectedTimeZone(),
  ): LocalSlot {
    const instant = new Date(`${localDate}T${localTime}:00Z`);
    const zone = isTimeZone(timeZone) ? timeZone : 'UTC';
    let formatter = this.formatters.get(zone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'longOffset',
      });
      this.formatters.set(zone, formatter);
    }
    const parts = formatter.formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((value) => value.type === type)?.value ?? '';
    return {
      localDate: `${part('year')}-${part('month')}-${part('day')}`,
      localTime: `${part('hour')}:${part('minute')}`,
      offset: part('timeZoneName').replace('GMT', 'UTC'),
    };
  }

  formatDate(localDate: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${localDate}T12:00:00Z`));
  }

  private listTimeZones(): string[] {
    const zones =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    return [...new Set(['UTC', this.detectTimeZone(), ...zones])].sort();
  }

  private readSavedTimeZone(): string | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      if (!isTimeZone(saved)) {
        this.selectedTimeZone.set('UTC');
        return null;
      }
      this.selectedTimeZone.set(saved);
      return saved;
    } catch {
      return null;
    }
  }

  private detectTimeZone(): string {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return isTimeZone(detected) ? detected : 'UTC';
    } catch {
      return 'UTC';
    }
  }
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
