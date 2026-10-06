import { Component, input } from '@angular/core';
import type { Poll, WorkspaceParticipant } from '../../../core/api/api.types';
import { InviteLinkComponent } from './invite-link/invite-link.component';
import { ParticipantListComponent } from './participant-list/participant-list.component';
import { PollListComponent } from './poll-list/poll-list.component';

@Component({
  selector: 'app-group-sidebar',
  imports: [InviteLinkComponent, ParticipantListComponent, PollListComponent],
  templateUrl: './group-sidebar.component.html',
  styleUrl: './group-sidebar.component.css',
})
export class GroupSidebarComponent {
  readonly groupName = input.required<string>();
  readonly inviteLink = input.required<string>();
  readonly inviteCode = input.required<string>();
  readonly participants = input.required<WorkspaceParticipant[]>();
  readonly polls = input.required<Poll[]>();
  readonly showParticipantStatuses = input(true);
  readonly currentParticipantId = input<string | null>(null);
}
