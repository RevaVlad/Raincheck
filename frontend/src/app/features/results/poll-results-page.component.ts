import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge, of, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { RaincheckApiService, type PollResults } from '../../core/api/raincheck-api.service';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { ErrorStateComponent } from '../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../shared/presentation/loading-state.component';

@Component({
  selector: 'app-poll-results-page',
  imports: [ErrorStateComponent, LoadingStateComponent, RouterLink, TimezoneDisplayPipe],
  templateUrl: './poll-results-page.component.html',
})
export class PollResultsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(RaincheckApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh = new Subject<void>();
  readonly timezone = inject(TimezonePreferenceService);
  readonly results = signal<PollResults | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly inviteCode = signal('');
  private readonly pollId = signal('');

  ngOnInit(): void {
    void this.timezone.ensureConfirmed().then(() => this.watchRoute());
  }

  reload(): void {
    this.refresh.next();
  }

  heatColor(available: number, confirmed: number): string {
    const hue = confirmed ? Math.round((available / confirmed) * 120) : 0;
    return `hsl(${hue} 55% 88%)`;
  }

  private watchRoute(): void {
    const routeParams = this.route.paramMap.pipe(
      map((params) => ({
        inviteCode: params.get('inviteCode') ?? '',
        pollId: params.get('pollId') ?? '',
      })),
      distinctUntilChanged(
        (previous, current) =>
          previous.inviteCode === current.inviteCode && previous.pollId === current.pollId,
      ),
    );
    const refreshedParams = this.refresh.pipe(
      map(() => ({ inviteCode: this.inviteCode(), pollId: this.pollId() })),
    );

    merge(routeParams, refreshedParams)
      .pipe(
        tap(({ inviteCode, pollId }) => {
          this.inviteCode.set(inviteCode);
          this.pollId.set(pollId);
          this.loading.set(true);
          this.error.set(null);
          this.results.set(null);
        }),
        switchMap(({ inviteCode, pollId }) =>
          this.api.getPollResults(inviteCode, pollId).pipe(
            map((results) => ({ kind: 'loaded' as const, results })),
            catchError((error: unknown) =>
              of({
                kind: 'failed' as const,
                message: RaincheckApiService.errorMessage(
                  error,
                  'Не удалось загрузить результаты.',
                ),
              }),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result.kind === 'loaded') this.results.set(result.results);
        else this.error.set(result.message);
        this.loading.set(false);
      });
  }
}
