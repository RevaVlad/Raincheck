import { Component, input } from '@angular/core';
import type { WorkspaceParticipant } from '../../../../core/api/api.types';

const STATUS_LABELS: Record<WorkspaceParticipant['currentPollState'], string> = {
  NONE: 'Нет ответа',
  DRAFT: 'Заполняет',
  CONFIRMED: 'Готово',
};

@Component({
  selector: 'app-group-participant',
  templateUrl: './participant.component.html',
})
export class ParticipantComponent {
  readonly participant = input.required<WorkspaceParticipant>();
  readonly showStatus = input(true);

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toLocaleUpperCase())
      .join('');
  }

  status(state: WorkspaceParticipant['currentPollState']): string {
    return STATUS_LABELS[state];
  }
}
