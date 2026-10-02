import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import type { WorkspaceParticipant } from '../../../core/api/raincheck-api.service';

@Component({
  selector: 'app-group-sidebar',
  imports: [MatButtonModule, MatCardModule],
  templateUrl: './group-sidebar.component.html',
  styleUrl: './group-sidebar.component.css',
})
export class GroupSidebarComponent {
  readonly groupName = input.required<string>();
  readonly inviteLink = input.required<string>();
  readonly participants = input.required<WorkspaceParticipant[]>();
  readonly copied = signal(false);
  private readonly clipboard = inject(Clipboard);

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toLocaleUpperCase())
      .join('');
  }

  status(state: WorkspaceParticipant['currentPollState']): string {
    const labels: Record<WorkspaceParticipant['currentPollState'], string> = {
      NONE: 'Нет ответа',
      DRAFT: 'Заполняет',
      CONFIRMED: 'Готово',
    };
    return labels[state];
  }

  copyInvite(): void {
    if (this.clipboard.copy(this.inviteLink())) this.copied.set(true);
  }
}
