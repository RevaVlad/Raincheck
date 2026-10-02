import { DOCUMENT } from '@angular/common';
import { Component, OnInit, computed, inject, input, output } from '@angular/core';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
import { GroupSidebarComponent } from './group-sidebar/group-sidebar.component';
import { PollEditorComponent } from './poll-editor/poll-editor.component';
import { PollEditorService } from './poll-editor/poll-editor.service';
import type { Poll, Workspace } from '../../core/api/raincheck-api.service';

@Component({
  selector: 'app-workspace-page',
  imports: [GroupSidebarComponent, PollEditorComponent],
  providers: [PollEditorService],
  templateUrl: './workspace-page.component.html',
})
export class WorkspacePageComponent implements OnInit {
  readonly inviteCode = input.required<string>();
  readonly workspace = input.required<Workspace>();
  readonly identityInvalidated = output<void>();
  readonly currentPoll = computed<Poll | null>(() => this.workspace().currentPoll);
  readonly inviteLink = computed(
    () => `${this.document.location?.origin ?? ''}/g/${encodeURIComponent(this.inviteCode())}`,
  );

  private readonly document = inject(DOCUMENT);
  private readonly session = inject(ParticipantSessionService);
  private readonly editor = inject(PollEditorService);

  ngOnInit(): void {
    const poll = this.currentPoll();
    const identity = this.session.get(this.inviteCode());
    if (poll && identity && this.workspace().me) {
      void this.editor.load(this.inviteCode(), poll, identity.token, () => {
        this.identityInvalidated.emit();
      });
    }
  }
}
