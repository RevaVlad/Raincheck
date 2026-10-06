import { TestBed } from '@angular/core/testing';

import { TimezonePreferenceService } from '../../../../core/timezone/timezone-preference.service';
import { AvailabilityGridCellComponent } from './availability-grid-cell.component';

describe('AvailabilityGridCellComponent', () => {
  it.each([
    { kind: 'UNAVAILABLE' as const, background: 'rgb(251, 233, 233)' },
    { kind: 'IF_NEEDED' as const, background: 'rgb(253, 245, 223)' },
    { kind: 'PREFERRED' as const, background: 'rgb(231, 245, 233)' },
  ])('owns the $kind cell color on its host', async ({ kind, background }) => {
    await TestBed.configureTestingModule({
      imports: [AvailabilityGridCellComponent],
    }).compileComponents();
    TestBed.inject(TimezonePreferenceService).selectedTimeZone.set('UTC');

    const fixture = TestBed.createComponent(AvailabilityGridCellComponent);
    fixture.componentRef.setInput('localDate', '2026-10-06');
    fixture.componentRef.setInput('startTime', '09:00');
    fixture.componentRef.setInput('dayStart', '09:00');
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();

    expect(getComputedStyle(fixture.nativeElement).backgroundColor).toBe(background);
  });
});
