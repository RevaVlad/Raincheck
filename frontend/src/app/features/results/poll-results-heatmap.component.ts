import { Component, computed, input } from '@angular/core';
import type { HeatmapCell } from '../../core/api/api.types';
import { convertUtcToLocalSlot, formatWeekday } from '../../core/timezone/timezone.utils';

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

function localHeatmapCell(cell: HeatmapCell, timeZone: string) {
  return {
    cell,
    ...convertUtcToLocalSlot(cell.localDate, cell.startTime, timeZone),
  };
}

@Component({
  imports: [],
  selector: 'app-poll-results-heatmap',
  templateUrl: './poll-results-heatmap.component.html',
})
export class PollResultsHeatmapComponent {
  readonly cells = input.required<HeatmapCell[]>();
  readonly confirmedParticipants = input.required<number>();
  readonly timeZone = input.required<string>();

  readonly heatmapGrid = computed<{ dates: HeatmapDate[]; rows: HeatmapRow[] }>(() => {
    const localCells = this.cells().map((cell) => localHeatmapCell(cell, this.timeZone()));
    const seenTimes = new Set<string>();
    const repeatedTimes = new Set<string>();
    for (const { localDate, localTime } of localCells) {
      const key = `${localDate}|${localTime}`;
      if (seenTimes.has(key)) repeatedTimes.add(localTime);
      seenTimes.add(key);
    }
    const dates = [...new Set(localCells.map(({ localDate }) => localDate))].sort().map((key) => ({
      key,
      weekday: formatWeekday(key, 'UTC').replace(/\.$/, ''),
      date: new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(`${key}T12:00:00Z`)),
    }));
    const keyedCells = localCells.map(({ cell, localDate, localTime, offset }) => ({
      key: `${localTime}${repeatedTimes.has(localTime) ? ` ${offset}` : ''}`,
      date: localDate,
      cell,
    }));
    const rowKeys = [...new Set(keyedCells.map(({ key }) => key))].sort((left, right) =>
      left.localeCompare(right, 'ru'),
    );
    const cellsByPosition = new Map(
      keyedCells.map(({ key, date, cell }) => [`${date}|${key}`, cell]),
    );
    const rows = rowKeys.map((key) => ({
      key,
      label: key,
      cells: dates.map((date) => cellsByPosition.get(`${date.key}|${key}`) ?? null),
    }));
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
    return `Могут: ${cell.available} из ${confirmed}. Предпочитают: ${cell.preferred}.`;
  }
}
