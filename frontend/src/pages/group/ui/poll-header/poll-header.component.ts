import { Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';

import type { Poll } from '@shared/api';
import { DateFormatPipe } from '@shared/lib/dates';

@Component({
  selector: 'app-poll-header',
  imports: [MatChipsModule, DateFormatPipe],
  templateUrl: './poll-header.component.html',
})
export class PollHeaderComponent {
  readonly poll = input.required<Poll>();
}
