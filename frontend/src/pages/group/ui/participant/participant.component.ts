import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { avatarColorHex } from '../../lib/avatar-colors';
import type { WorkspaceParticipant } from '@shared/api';

const STATUS_LABELS: Record<WorkspaceParticipant['currentPollState'], string> = {
  NONE: 'Нет ответа',
  DRAFT: 'Заполняет',
  CONFIRMED: 'Готово',
};

@Component({
  selector: 'app-group-participant',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './participant.component.html',
})
export class ParticipantComponent {
  readonly participant = input.required<WorkspaceParticipant>();
  readonly inviteCode = input.required<string>();
  readonly currentParticipantId = input<string | null>(null);
  readonly showStatus = input(true);
  readonly isCurrent = computed(() => this.participant().id === this.currentParticipantId());

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

  color(color: WorkspaceParticipant['avatarColor']): string {
    return avatarColorHex(color);
  }
}
