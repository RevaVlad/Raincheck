import { TestBed } from '@angular/core/testing';
import type { HeatmapCell } from '@shared/api';
import { PollResultsHeatmapComponent } from './poll-results-heatmap.component';

function cell(startAt: string, available = 1): HeatmapCell {
  return {
    startAt,
    endAt: new Date(Date.parse(startAt) + 30 * 60_000).toISOString(),
    available,
    ifNeeded: 0,
    preferred: available,
    unavailable: 0,
    averageSoftScore: 1,
  };
}

describe('PollResultsHeatmapComponent', () => {
  it('renders separate rows for repeated local times without timezone labels', async () => {
    await TestBed.configureTestingModule({
      imports: [PollResultsHeatmapComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PollResultsHeatmapComponent);
    fixture.componentRef.setInput('cells', [
      cell('2026-11-01T05:00:00.000Z', 1),
      cell('2026-11-01T06:00:00.000Z', 2),
      cell('2026-11-02T06:00:00.000Z', 1),
    ]);
    fixture.componentRef.setInput('confirmedParticipants', 2);
    fixture.componentRef.setInput('timeZone', 'America/New_York');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('tbody th')].map((node) => node.textContent?.trim())).toEqual([
      '01:00',
      '01:00',
    ]);
    expect([...root.querySelectorAll('thead th')].map((node) => node.textContent?.trim())).toEqual([
      'Время',
      'вс1 нояб. 2026',
      'пн2 нояб. 2026',
    ]);
    expect(
      [...root.querySelectorAll('tbody tr')].map((row) =>
        [...row.querySelectorAll('td')].map((td) => td.textContent?.trim()),
      ),
    ).toEqual([
      ['1/2', '1/2'],
      ['2/2', ''],
    ]);
    expect(root.textContent).not.toContain('UTC');
    expect(root.querySelector('td')?.getAttribute('aria-label')).toContain('1 ноября 2026, 01:00');
  });
});
