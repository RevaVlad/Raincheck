import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatAnchor } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-errors';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { ErrorStateComponent } from '../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../shared/presentation/loading-state.component';
import {
  GroupSidebarContext,
  type SidebarPresentation,
} from '../group/group-sidebar-context.service';
import { GroupFacade } from '../group/group.facade';
import { PollResultsApiService } from './poll-results-api.service';
import { PollResultsHeatmapComponent } from './poll-results-heatmap.component';

@Component({
  selector: 'app-poll-results-page',
  imports: [
    ErrorStateComponent,
    LoadingStateComponent,
    MatAnchor,
    PollResultsHeatmapComponent,
    RouterLink,
    TimezoneDisplayPipe,
  ],
  templateUrl: './poll-results-page.component.html',
})
export class PollResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PollResultsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sidebarContext = inject(GroupSidebarContext);
  readonly group = inject(GroupFacade);
  readonly timezone = inject(TimezonePreferenceService);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly timezoneConfirmed = signal(false);
  private readonly refreshVersion = signal(0);
  readonly inviteCode = computed(() => this.routeParams().get('inviteCode') ?? '');
  private readonly pollId = computed(() => this.routeParams().get('pollId') ?? '');
  readonly selectedPoll = computed(
    () => this.group.workspace()?.polls.find((poll) => poll.id === this.pollId()) ?? null,
  );
  readonly pageTitle = computed(() => {
    const poll = this.selectedPoll();
    return poll ? poll.title || `Опрос #${poll.sequenceNo}` : 'Результаты';
  });
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
  private readonly sidebarPresentation = computed<SidebarPresentation>(() => {
    const participants = this.group.workspace()?.participants ?? [];
    const resultParticipants = this.results()?.participants;
    if (!resultParticipants) return { showParticipantStatuses: false };

    const states = new Map(
      resultParticipants.map((participant) => [participant.id, participant.state]),
    );
    return {
      participants: participants.map((participant) => ({
        ...participant,
        currentPollState: states.get(participant.id) ?? 'NONE',
      })),
      showParticipantStatuses: true,
    };
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

  constructor() {
    this.destroyRef.onDestroy(
      this.sidebarContext.setPresentationOverride(() => this.sidebarPresentation()),
    );
    void this.timezone.ensureConfirmed().then(() => this.timezoneConfirmed.set(true));
  }

  reload(): void {
    this.refreshVersion.update((version) => version + 1);
  }
}
