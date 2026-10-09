import { DOCUMENT } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import type { WorkspaceParticipant } from '@shared/api';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { GroupSidebarContext } from '../../model/group-sidebar-context/group-sidebar-context.service';
import { InviteLinkComponent } from '../invite-link/invite-link.component';
import { ParticipantListComponent } from '../participant-list/participant-list.component';
import { PollListComponent } from '../poll-list/poll-list.component';

@Component({
  selector: 'app-group-sidebar',
  imports: [InviteLinkComponent, ParticipantListComponent, PollListComponent],
  templateUrl: './group-sidebar.component.html',
  styleUrl: './group-sidebar.component.css',
})
export class GroupSidebarComponent {
  readonly group = inject(GroupFacade);
  private readonly document = inject(DOCUMENT);
  private readonly context = inject(GroupSidebarContext);

  readonly groupName = computed(() => this.group.workspace()?.group.name ?? '');
  readonly inviteLink = computed(() => {
    const origin = this.document.location?.origin ?? '';
    return `${origin}/g/${encodeURIComponent(this.group.inviteCode())}`;
  });
  readonly participants = computed<WorkspaceParticipant[]>(() => {
    const workspace = this.group.workspace();
    return this.context.temporaryPresentation()?.().participants ?? workspace?.participants ?? [];
  });
  readonly polls = computed(() => this.group.workspace()?.polls ?? []);
  readonly showParticipantStatuses = computed(
    () => this.context.temporaryPresentation()?.().showParticipantStatuses ?? true,
  );
  readonly currentParticipantId = computed(() => this.group.workspace()?.me?.id ?? null);
}
