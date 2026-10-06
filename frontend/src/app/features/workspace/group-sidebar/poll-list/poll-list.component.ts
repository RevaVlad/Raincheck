import { Component, computed, input } from '@angular/core';
import type { Poll } from '../../../../core/api/api.types';
import { PollRowComponent } from './poll-row.component';

@Component({
  selector: 'app-poll-list',
  imports: [PollRowComponent],
  templateUrl: './poll-list.component.html',
})
export class PollListComponent {
  readonly inviteCode = input.required<string>();
  readonly polls = input.required<Poll[]>();

  readonly sortedPolls = computed(() =>
    [...this.polls()].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.sequenceNo - a.sequenceNo,
    ),
  );
  readonly currentPoll = computed(() => this.sortedPolls().find((poll) => poll.status === 'OPEN'));
  readonly pastPolls = computed(() =>
    this.sortedPolls().filter((poll) => poll.status === 'CLOSED'),
  );
}
