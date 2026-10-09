import { Component, computed, input } from '@angular/core';
import type { HeatmapCell } from '../../../core/api/api.types';
import {
  formatCalendarDate,
  formatInstantTime,
  formatInstantWeekday,
  localCalendarDate,
} from '../../../core/dates/date.utils';

interface HeatmapDate {
  key: string;
  weekday: string;
  date: string;
}

interface HeatmapRow {
  key: string;
  label: string;
  cells: Array<HeatmapCell | null>;
}

@Component({
  selector: 'app-poll-results-heatmap',
  templateUrl: './poll-results-heatmap.component.html',
})
export class PollResultsHeatmapComponent {
  readonly cells = input.required<HeatmapCell[]>();
  readonly confirmedParticipants = input.required<number>();
  readonly timeZone = input.required<string>();

  readonly heatmapGrid = computed<{ dates: HeatmapDate[]; rows: HeatmapRow[] }>(() => {
    const projected = this.cells().map((cell) => ({
      cell,
      date: localCalendarDate(cell.startAt, this.timeZone()),
      time: formatInstantTime(cell.startAt, this.timeZone()),
    }));
    const slotsByPosition = new Map<string, HeatmapCell[]>();
    for (const item of projected) {
      const key = `${item.date}|${item.time}`;
      slotsByPosition.set(key, [...(slotsByPosition.get(key) ?? []), item.cell]);
    }

    const dateMap = new Map<string, HeatmapDate>();
    for (const item of projected) {
      if (dateMap.has(item.date)) continue;
      dateMap.set(item.date, {
        key: item.date,
        weekday: formatInstantWeekday(item.cell.startAt, this.timeZone()).replace(/\.$/, ''),
        date: formatCalendarDate(item.date, 'short'),
      });
    }
    const dates = [...dateMap.values()].sort((left, right) => left.key.localeCompare(right.key));
    const times = [...new Set(projected.map(({ time }) => time))].sort();
    const rows = times.flatMap((time) => {
      const count = Math.max(
        ...dates.map((date) => slotsByPosition.get(`${date.key}|${time}`)?.length ?? 0),
      );
      return Array.from({ length: count }, (_, occurrence) => ({
        key: `${time}-${occurrence}`,
        label: time,
        cells: dates.map(
          (date) => slotsByPosition.get(`${date.key}|${time}`)?.[occurrence] ?? null,
        ),
      }));
    });
    return { dates, rows };
  });

  heatClass(available: number, confirmed: number): string {
    if (!available || !confirmed) return 'bg-background';
    const ratio = Math.min(available / confirmed, 1);
    if (ratio === 1) return 'bg-availability-density-full';
    if (ratio >= 0.67) return 'bg-availability-density-high';
    if (ratio >= 0.34) return 'bg-availability-density-medium';
    return 'bg-availability-density-low';
  }

  heatDescription(cell: HeatmapCell, confirmed: number): string {
    const date = formatCalendarDate(localCalendarDate(cell.startAt, this.timeZone()), 'long');
    const time = formatInstantTime(cell.startAt, this.timeZone());
    return (
      `${date}, ${time}. ` +
      `Могут: ${cell.available} из ${confirmed}. ` +
      `Предпочитают: ${cell.preferred}.`
    );
  }
}
