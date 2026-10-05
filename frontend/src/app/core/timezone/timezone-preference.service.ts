import { Injectable, signal } from '@angular/core';
import { isValidTimeZone } from './timezone.utils';

const STORAGE_KEY = 'raincheck.timezone';

@Injectable({ providedIn: 'root' })
export class TimezonePreferenceService {
  readonly promptOpen = signal(false);
  readonly selectedTimeZone = signal(this.detectTimeZone());
  readonly timeZones = this.listTimeZones();
  private pendingConfirmation: Promise<string> | null = null;
  private resolveConfirmation: ((timeZone: string) => void) | null = null;

  ensureConfirmed(): Promise<string> {
    const saved = this.readSavedTimeZone();
    if (saved) return Promise.resolve(saved);
    if (this.pendingConfirmation) return this.pendingConfirmation;
    this.promptOpen.set(true);
    this.pendingConfirmation = new Promise((resolve) => {
      this.resolveConfirmation = resolve;
    });
    return this.pendingConfirmation;
  }

  confirm(): string {
    const selected = this.selectedTimeZone();
    const value = isValidTimeZone(selected) ? selected : 'UTC';
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* Storage may be disabled. */
    }
    this.promptOpen.set(false);
    const resolve = this.resolveConfirmation;
    this.pendingConfirmation = null;
    this.resolveConfirmation = null;
    resolve?.(value);
    return value;
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
      if (!isValidTimeZone(saved)) {
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
      return isValidTimeZone(detected) ? detected : 'UTC';
    } catch {
      return 'UTC';
    }
  }
}
