import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import type { WorkspaceParticipant } from '../../../core/api/api.types';
import { InviteLinkComponent } from './invite-link/invite-link.component';
import { ParticipantComponent } from './participant/participant.component';

@Component({
  selector: 'app-group-sidebar',
  imports: [MatCardModule, InviteLinkComponent, ParticipantComponent],
  templateUrl: './group-sidebar.component.html',
  styleUrl: './group-sidebar.component.css',
})
export class GroupSidebarComponent {
  readonly groupName = input.required<string>();
  readonly inviteLink = input.required<string>();
  readonly participants = input.required<WorkspaceParticipant[]>();
}
