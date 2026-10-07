import { TestBed } from '@angular/core/testing';

import { TimezonePreferenceService } from '../../../../core/timezone/timezone-preference.service';
import { AvailabilityGridCellComponent } from './availability-grid-cell.component';

describe('AvailabilityGridCellComponent', () => {
  it.each([
    { kind: 'UNAVAILABLE' as const, stateClass: 'unavailable' },
    { kind: 'IF_NEEDED' as const, stateClass: 'if-needed' },
    { kind: 'PREFERRED' as const, stateClass: 'preferred' },
  ])('applies the $kind state class on its host', async ({ kind, stateClass }) => {
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

    expect(fixture.nativeElement.classList.contains(stateClass)).toBe(true);
  });
});
