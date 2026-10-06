import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-errors';
import type { HeatmapCell, WorkspaceParticipant } from '../../core/api/api.types';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { convertUtcToLocalSlot, formatWeekday } from '../../core/timezone/timezone.utils';
import { ErrorStateComponent } from '../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../shared/presentation/loading-state.component';
import { GroupFacade } from '../group/group.facade';
import { GroupSidebarComponent } from '../workspace/group-sidebar/group-sidebar.component';
import { PollResultsApiService } from './poll-results-api.service';
import { MatAnchor } from '@angular/material/button';

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
  selector: 'app-poll-results-page',
  imports: [
    ErrorStateComponent,
    GroupSidebarComponent,
    LoadingStateComponent,
    RouterLink,
    TimezoneDisplayPipe,
    MatAnchor
],
  templateUrl: './poll-results-page.component.html',
})
export class PollResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(PollResultsApiService);
  readonly group = inject(GroupFacade);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly timezoneConfirmed = signal(false);
  private readonly refreshVersion = signal(0);
  readonly timezone = inject(TimezonePreferenceService);
  readonly inviteCode = computed(() => this.routeParams().get('inviteCode') ?? '');
  private readonly pollId = computed(() => this.routeParams().get('pollId') ?? '');
  readonly selectedPoll = computed(
    () => this.group.workspace()?.polls.find((poll) => poll.id === this.pollId()) ?? null,
  );
  readonly pageTitle = computed(() => {
    const poll = this.selectedPoll();
    return poll ? poll.title || `Опрос #${poll.sequenceNo}` : 'Результаты';
  });
  readonly inviteLink = computed(
    () => `${this.document.location?.origin ?? ''}/g/${encodeURIComponent(this.inviteCode())}`,
  );
  readonly sidebarParticipants = computed<WorkspaceParticipant[]>(() => {
    const participants = this.group.workspace()?.participants ?? [];
    const resultParticipants = this.results()?.participants;
    if (!resultParticipants) return participants;
    const states = new Map(
      resultParticipants.map((participant) => [participant.id, participant.state]),
    );
    return participants.map((participant) => ({
      ...participant,
      currentPollState: states.get(participant.id) ?? 'NONE',
    }));
  });
  readonly showParticipantStatuses = computed(() => this.results() !== null);
  readonly resultsResource = this.api.resultsResource(() => {
    void this.refreshVersion();
    const inviteCode = this.inviteCode();
    const pollId = this.pollId();
    return this.timezoneConfirmed() && inviteCode && pollId ? { inviteCode, pollId } : undefined;
  });
  readonly results = computed(() => {
    if (
      this.resultsResource.isLoading() ||
      this.resultsResource.error() !== undefined ||
      !this.resultsResource.hasValue()
    ) {
      return null;
    }
    return this.resultsResource.value() ?? null;
  });
  readonly loading = computed(() => {
    if (!this.timezoneConfirmed()) return true;
    if (!this.inviteCode() || !this.pollId()) return false;
    return (
      this.resultsResource.isLoading() ||
      (!this.resultsResource.hasValue() && this.resultsResource.error() === undefined)
    );
  });
  readonly error = computed(() => {
    const error = this.resultsResource.error();
    return error ? apiErrorMessage(error, 'Не удалось загрузить результаты.') : null;
  });
  readonly heatmapGrid = computed(() => {
    const data = this.results();
    if (!data) return { dates: [] as HeatmapDate[], rows: [] as HeatmapRow[] };

    const localCells = data.heatmap.map((cell) =>
      localHeatmapCell(cell, this.timezone.selectedTimeZone()),
    );
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

  constructor() {
    void this.timezone.ensureConfirmed().then(() => this.timezoneConfirmed.set(true));
  }

  reload(): void {
    this.refreshVersion.update((version) => version + 1);
  }

  heatClass(available: number, confirmed: number): string {
    if (!available || !confirmed) return 'bg-slate-50';
    const ratio = Math.min(available / confirmed, 1);
    if (ratio === 1) return 'bg-emerald-300';
    if (ratio >= 0.67) return 'bg-emerald-200';
    if (ratio >= 0.34) return 'bg-emerald-100';
    return 'bg-emerald-50';
  }

  heatDescription(cell: HeatmapCell, confirmed: number): string {
    return `Могут: ${cell.available} из ${confirmed}. Предпочитают: ${cell.preferred}.`;
  }
}
