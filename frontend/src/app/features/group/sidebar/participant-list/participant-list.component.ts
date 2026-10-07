import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import type { WorkspaceParticipant } from '../../../../core/api/api.types';
import { ParticipantComponent } from '../participant/participant.component';

@Component({
  selector: 'app-group-participant-list',
  imports: [MatCardModule, ParticipantComponent],
  templateUrl: './participant-list.component.html',
})
export class ParticipantListComponent {
  readonly participants = input.required<WorkspaceParticipant[]>();
  readonly inviteCode = input.required<string>();
  readonly currentParticipantId = input<string | null>(null);
  readonly showStatuses = input(true);
}
