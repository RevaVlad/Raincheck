import { TestBed } from '@angular/core/testing';
import type { HeatmapCell } from '../../core/api/api.types';
import { PollResultsHeatmapComponent } from './poll-results-heatmap.component';

describe('PollResultsHeatmapComponent', () => {
  it('converts UTC slots and disambiguates repeated daylight-saving times', async () => {
    await TestBed.configureTestingModule({
      imports: [PollResultsHeatmapComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PollResultsHeatmapComponent);
    const cells: HeatmapCell[] = [
      {
        localDate: '2026-10-06',
        startTime: '01:00',
        endTime: '01:30',
        available: 1,
        ifNeeded: 0,
        preferred: 0,
        unavailable: 0,
        averageSoftScore: 0,
      },
      {
        localDate: '2026-11-01',
        startTime: '08:30',
        endTime: '09:00',
        available: 1,
        ifNeeded: 0,
        preferred: 0,
        unavailable: 0,
        averageSoftScore: 0,
      },
      {
        localDate: '2026-11-01',
        startTime: '09:30',
        endTime: '10:00',
        available: 1,
        ifNeeded: 0,
        preferred: 0,
        unavailable: 0,
        averageSoftScore: 0,
      },
    ];
    fixture.componentRef.setInput('cells', cells);
    fixture.componentRef.setInput('timeZone', 'America/Los_Angeles');
    fixture.componentRef.setInput('confirmedParticipants', 1);
    fixture.detectChanges();

    expect(fixture.componentInstance.heatmapGrid().dates.map((date) => date.key)).toEqual([
      '2026-10-05',
      '2026-11-01',
    ]);
    expect(fixture.componentInstance.heatmapGrid().rows.map((row) => row.label)).toContain('18:00');
    expect(fixture.componentInstance.heatmapGrid().rows.map((row) => row.label)).toContain(
      '01:30 UTC-07:00',
    );
    expect(fixture.componentInstance.heatmapGrid().rows.map((row) => row.label)).toContain(
      '01:30 UTC-08:00',
    );
  });
});
