import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TimezonePreferenceService } from './timezone-preference.service';
import { TimezoneDisplayPipe } from './timezone-display.pipe';

@Component({
  standalone: true,
  imports: [TimezoneDisplayPipe],
  template: `<p>
    {{ '2026-03-08' | timezoneDisplay: timezone.selectedTimeZone() : 'time' : '06:30' }}
  </p>`,
})
class TimezoneLabelHost {
  readonly timezone = inject(TimezonePreferenceService);
}

describe('TimezoneDisplayPipe', () => {
  beforeEach(() => {
    localStorage.removeItem('raincheck.timezone');
  });

  it('formats the local date when UTC conversion crosses midnight', () => {
    const pipe = TestBed.runInInjectionContext(() => new TimezoneDisplayPipe());

    expect(pipe.transform('2026-10-03', 'America/Los_Angeles', 'date', '01:00')).toBe(
      TestBed.inject(TimezonePreferenceService).formatDate('2026-10-02'),
    );
  });

  it('uses the correct offset for both sides of a daylight-saving transition', () => {
    const pipe = TestBed.runInInjectionContext(() => new TimezoneDisplayPipe());

    expect(pipe.transform('2026-11-01', 'America/New_York', 'offset', '05:30')).toBe('UTC-04:00');
    expect(pipe.transform('2026-11-01', 'America/New_York', 'offset', '06:30')).toBe('UTC-05:00');
  });

  it('shows both local dates when a slot crosses midnight', () => {
    const pipe = TestBed.runInInjectionContext(() => new TimezoneDisplayPipe());
    const timezone = TestBed.inject(TimezonePreferenceService);

    expect(pipe.transform('2026-10-03', 'America/Los_Angeles', 'slot', '06:30', '07:30')).toBe(
      `${timezone.formatDate('2026-10-02')} — ${timezone.formatDate('2026-10-03')}, 23:30–00:30 UTC-07:00`,
    );
  });

  it('refreshes an already-rendered time when the selected timezone changes', async () => {
    await TestBed.configureTestingModule({ imports: [TimezoneLabelHost] }).compileComponents();
    const fixture = TestBed.createComponent(TimezoneLabelHost);
    const timezone = TestBed.inject(TimezonePreferenceService);
    timezone.selectedTimeZone.set('UTC');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p').textContent.trim()).toBe('06:30');

    timezone.selectedTimeZone.set('America/New_York');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('p').textContent.trim()).toBe('01:30');
  });
});
