import { Component, inject, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

import type { Poll } from '../../core/api/api.types';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';

@Component({
  selector: 'app-poll-header',
  imports: [MatChipsModule, TimezoneDisplayPipe],
  templateUrl: './poll-header.component.html',
})
export class PollHeaderComponent {
  readonly poll = input.required<Poll>();
  readonly timezone = inject(TimezonePreferenceService);
}
