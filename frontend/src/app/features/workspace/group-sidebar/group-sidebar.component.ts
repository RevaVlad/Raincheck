import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import type { Poll, WorkspaceParticipant } from '../../../core/api/api.types';
import { InviteLinkComponent } from './invite-link/invite-link.component';
import { ParticipantComponent } from './participant/participant.component';
import { PollListComponent } from './poll-list/poll-list.component';

@Component({
  selector: 'app-group-sidebar',
  imports: [MatCardModule, InviteLinkComponent, ParticipantComponent, PollListComponent],
  templateUrl: './group-sidebar.component.html',
  styleUrl: './group-sidebar.component.css',
})
export class GroupSidebarComponent {
  readonly groupName = input.required<string>();
  readonly inviteLink = input.required<string>();
  readonly inviteCode = input.required<string>();
  readonly participants = input.required<WorkspaceParticipant[]>();
  readonly polls = input.required<Poll[]>();
}
