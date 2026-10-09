import { Component, computed, input } from '@angular/core';
import { formatCalendarDate } from '@shared/lib/dates';
import type { AvailabilityKind } from '../../model/availability.types';

@Component({
  selector: 'app-availability-grid-cell',
  template: '',
  styleUrl: './availability-grid-cell.component.css',
  host: {
    class: 'cell',
    role: 'gridcell',
    '[attr.data-start-at]': 'startAt()',
    '[attr.title]': 'title()',
    '[attr.aria-label]': 'ariaLabel()',
    '[class.unavailable]': "kind() === 'UNAVAILABLE'",
    '[class.if-needed]': "kind() === 'IF_NEEDED'",
    '[class.preferred]': "kind() === 'PREFERRED'",
  },
})
export class AvailabilityGridCellComponent {
  readonly startAt = input.required<string>();
  readonly date = input.required<string>();
  readonly time = input.required<string>();
  readonly kind = input.required<AvailabilityKind | null>();

  readonly title = computed(() => `${formatCalendarDate(this.date(), 'long')} ${this.time()}`);
  readonly ariaLabel = computed(() => `${this.title()}: ${this.kind() ?? 'нейтрально'}`);
}
