import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Poll } from '@shared/api';

@Component({
  selector: 'app-poll-row',
  imports: [RouterLink],
  templateUrl: './poll-row.component.html',
})
export class PollRowComponent {
  readonly inviteCode = input.required<string>();
  readonly poll = input.required<Poll>();
}
