import { TestBed } from '@angular/core/testing';
import { AvailabilityGridCellComponent } from './availability-grid-cell.component';

describe('AvailabilityGridCellComponent', () => {
  it('exposes a UTC slot key with local, timezone-free accessible labels', async () => {
    await TestBed.configureTestingModule({
      imports: [AvailabilityGridCellComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(AvailabilityGridCellComponent);
    fixture.componentRef.setInput('startAt', '2026-10-06T09:00:00.000Z');
    fixture.componentRef.setInput('date', '2026-10-06');
    fixture.componentRef.setInput('time', '14:00');
    fixture.componentRef.setInput('kind', 'PREFERRED');
    fixture.detectChanges();

    const cell = fixture.nativeElement as HTMLElement;
    expect(cell.dataset['startAt']).toBe('2026-10-06T09:00:00.000Z');
    expect(cell.title).toBe('6 октября 2026 14:00');
    expect(cell.getAttribute('aria-label')).toBe('6 октября 2026 14:00: PREFERRED');
    expect(cell.getAttribute('aria-label')).not.toContain('UTC');
  });
});
