import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RaincheckApiService, type PollResults } from '../../core/api/raincheck-api.service';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';

@Component({
  selector: 'app-poll-results-page',
  imports: [RouterLink],
  templateUrl: './poll-results-page.component.html',
})
export class PollResultsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(RaincheckApiService);
  readonly timezone = inject(TimezonePreferenceService);
  readonly results = signal<PollResults | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly inviteCode = this.route.snapshot.paramMap.get('inviteCode') ?? '';
  readonly pollId = this.route.snapshot.paramMap.get('pollId') ?? '';

  async ngOnInit(): Promise<void> {
    await this.timezone.ensureConfirmed();
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.results.set(await firstValueFrom(this.api.getPollResults(this.inviteCode, this.pollId)));
    } catch (error) {
      this.error.set(RaincheckApiService.errorMessage(error, 'Не удалось загрузить результаты.'));
    } finally {
      this.loading.set(false);
    }
  }

  slotLabel(date: string, start: string, end: string): string {
    const from = this.timezone.convertUtc(date, start);
    const to = this.timezone.convertUtc(date, end);
    return `${this.timezone.formatDate(from.localDate)}, ${from.localTime}–${to.localTime} ${from.offset}`;
  }

  heatColor(available: number, confirmed: number): string {
    const hue = confirmed ? Math.round((available / confirmed) * 120) : 0;
    return `hsl(${hue} 55% 88%)`;
  }
}
