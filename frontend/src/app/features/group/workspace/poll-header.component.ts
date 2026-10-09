import { Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

import type { Poll } from '../../../core/api/api.types';
import { DateFormatPipe } from '../../../core/dates/date-format.pipe';

@Component({
  selector: 'app-poll-header',
  imports: [MatChipsModule, DateFormatPipe],
  templateUrl: './poll-header.component.html',
})
export class PollHeaderComponent {
  readonly poll = input.required<Poll>();
}
