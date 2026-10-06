import { Component, computed, inject, input } from '@angular/core';

import { TimezoneDisplayPipe } from '../../../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../../../core/timezone/timezone-preference.service';
import type { AvailabilityKind } from '../poll-editor.service';

@Component({
  selector: 'app-availability-grid-cell',
  providers: [TimezoneDisplayPipe],
  template: '',
  styleUrl: './availability-grid-cell.component.css',
  host: {
    class: 'cell',
    role: 'gridcell',
    '[attr.data-date]': 'localDate()',
    '[attr.data-time]': 'startTime()',
    '[attr.title]': 'title()',
    '[attr.aria-label]': 'ariaLabel()',
    '[class.unavailable]': "kind() === 'UNAVAILABLE'",
    '[class.if-needed]': "kind() === 'IF_NEEDED'",
    '[class.preferred]': "kind() === 'PREFERRED'",
  },
})
export class AvailabilityGridCellComponent {
  readonly localDate = input.required<string>();
  readonly startTime = input.required<string>();
  readonly dayStart = input.required<string>();
  readonly kind = input.required<AvailabilityKind | null>();

  private readonly timezone = inject(TimezonePreferenceService);
  private readonly timezoneDisplay = inject(TimezoneDisplayPipe);

  readonly title = computed(() => {
    const timeZone = this.timezone.selectedTimeZone();
    const time = this.timezoneDisplay.transform(
      this.localDate(),
      timeZone,
      'time',
      this.startTime(),
    );
    const offset = this.timezoneDisplay.transform(
      this.localDate(),
      timeZone,
      'offset',
      this.startTime(),
    );
    return `${time} ${offset}`;
  });

  readonly ariaLabel = computed(() => {
    const timeZone = this.timezone.selectedTimeZone();
    const localDate = this.localDate();
    const weekday = this.timezoneDisplay.transform(
      localDate,
      timeZone,
      'weekday',
      this.dayStart(),
    );
    const date = this.timezoneDisplay.transform(localDate, timeZone, 'date', this.dayStart());
    return `${weekday} ${date} ${this.title()}: ${this.kind() ?? 'нейтрально'}`;
  });
}
