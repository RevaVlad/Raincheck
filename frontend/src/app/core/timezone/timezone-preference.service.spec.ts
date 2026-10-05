import { TestBed } from '@angular/core/testing';
import { TimezonePreferenceService } from './timezone-preference.service';
import { convertUtcToLocalSlot } from './timezone.utils';

describe('TimezonePreferenceService', () => {
  let timezone: TimezonePreferenceService;

  beforeEach(() => {
    localStorage.removeItem('raincheck.timezone');
    TestBed.configureTestingModule({ providers: [TimezonePreferenceService] });
    timezone = TestBed.inject(TimezonePreferenceService);
  });

  it('asks once, stores the confirmed choice and reuses it', async () => {
    const first = timezone.ensureConfirmed();
    const concurrent = timezone.ensureConfirmed();
    expect(first).toBe(concurrent);
    expect(timezone.promptOpen()).toBe(true);
    timezone.selectedTimeZone.set('Europe/Paris');
    timezone.confirm();
    await expect(first).resolves.toBe('Europe/Paris');
    await expect(concurrent).resolves.toBe('Europe/Paris');
    await expect(timezone.ensureConfirmed()).resolves.toBe('Europe/Paris');
    const nextVisit = new TimezonePreferenceService();
    await expect(nextVisit.ensureConfirmed()).resolves.toBe('Europe/Paris');
    expect(nextVisit.selectedTimeZone()).toBe('Europe/Paris');
  });

  it('falls back to UTC for an invalid saved zone', async () => {
    localStorage.setItem('raincheck.timezone', 'Not/AZone');
    const confirmation = timezone.ensureConfirmed();
    expect(timezone.promptOpen()).toBe(true);
    timezone.selectedTimeZone.set('Not/AZone');
    timezone.confirm();
    await expect(confirmation).resolves.toBe('UTC');
    expect(localStorage.getItem('raincheck.timezone')).toBe('UTC');
  });

  it('converts midnight shifts and both sides of DST changes with 24-hour time', () => {
    expect(convertUtcToLocalSlot('2026-10-03', '01:00', 'America/Los_Angeles')).toMatchObject({
      localDate: '2026-10-02',
      localTime: '18:00',
      offset: 'UTC-07:00',
    });
    expect(convertUtcToLocalSlot('2026-03-08', '06:30', 'America/New_York')).toMatchObject({
      localTime: '01:30',
      offset: 'UTC-05:00',
    });
    expect(convertUtcToLocalSlot('2026-03-08', '07:30', 'America/New_York')).toMatchObject({
      localTime: '03:30',
      offset: 'UTC-04:00',
    });
    expect(convertUtcToLocalSlot('2026-11-01', '05:30', 'America/New_York')).toMatchObject({
      localTime: '01:30',
      offset: 'UTC-04:00',
    });
    expect(convertUtcToLocalSlot('2026-11-01', '06:30', 'America/New_York')).toMatchObject({
      localTime: '01:30',
      offset: 'UTC-05:00',
    });
  });
});
