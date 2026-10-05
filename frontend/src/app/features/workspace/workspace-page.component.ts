import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import type { Poll } from '../../core/api/raincheck-api.service';
import { GroupFacade } from '../group/group.facade';
import { GroupSidebarComponent } from './group-sidebar/group-sidebar.component';
import { PollEditorComponent } from './poll-editor/poll-editor.component';
import { PollEditorService } from './poll-editor/poll-editor.service';

@Component({
  selector: 'app-workspace-page',
  imports: [GroupSidebarComponent, PollEditorComponent, RouterLink, TimezoneDisplayPipe],
  providers: [PollEditorService],
  templateUrl: './workspace-page.component.html',
})
export class WorkspacePageComponent {
  readonly group = inject(GroupFacade);
  readonly workspace = computed(() => this.group.workspace()!);
  readonly currentPoll = computed(() => this.group.workspace()?.currentPoll ?? null);
  readonly inviteLink = computed(
    () =>
      `${this.document.location?.origin ?? ''}/g/${encodeURIComponent(this.group.inviteCode())}`,
  );

  private readonly document = inject(DOCUMENT);
  private readonly session = inject(ParticipantSessionService);
  private readonly editor = inject(PollEditorService);
  readonly timezone = inject(TimezonePreferenceService);

  constructor() {
    effect(() => {
      const inviteCode = this.group.inviteCode();
      const poll = this.currentPoll();
      if (!inviteCode || !poll || !this.group.workspace()?.me) return;
      void this.loadEditor(inviteCode, poll);
    });
  }

  private async loadEditor(inviteCode: string, poll: Poll): Promise<void> {
    await this.timezone.ensureConfirmed();
    if (
      inviteCode !== this.group.inviteCode() ||
      this.currentPoll()?.id !== poll.id ||
      !this.group.workspace()?.me
    ) {
      return;
    }
    const identity = this.session.get(inviteCode);
    if (identity) {
      void this.editor.load(inviteCode, poll, identity.token, () =>
        this.group.invalidateIdentity(inviteCode),
      );
    }
  }
}
