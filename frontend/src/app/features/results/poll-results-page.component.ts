import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-errors';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { ErrorStateComponent } from '../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../shared/presentation/loading-state.component';
import { PollResultsApiService } from './poll-results-api.service';

@Component({
  selector: 'app-poll-results-page',
  imports: [ErrorStateComponent, LoadingStateComponent, RouterLink, TimezoneDisplayPipe],
  templateUrl: './poll-results-page.component.html',
})
export class PollResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PollResultsApiService);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly timezoneConfirmed = signal(false);
  private readonly refreshVersion = signal(0);
  readonly timezone = inject(TimezonePreferenceService);
  readonly inviteCode = computed(() => this.routeParams().get('inviteCode') ?? '');
  private readonly pollId = computed(() => this.routeParams().get('pollId') ?? '');
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

  constructor() {
    void this.timezone.ensureConfirmed().then(() => this.timezoneConfirmed.set(true));
  }

  reload(): void {
    this.refreshVersion.update((version) => version + 1);
  }

  heatColor(available: number, confirmed: number): string {
    const hue = confirmed ? Math.round((available / confirmed) * 120) : 0;
    return `hsl(${hue} 55% 88%)`;
  }
}
