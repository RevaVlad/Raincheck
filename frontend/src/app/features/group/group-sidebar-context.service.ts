import { Injectable, signal } from '@angular/core';
import type { WorkspaceParticipant } from '../../core/api/api.types';

export interface SidebarPresentation {
  participants?: WorkspaceParticipant[];
  showParticipantStatuses?: boolean;
}

@Injectable()
export class GroupSidebarContext {
  readonly temporaryPresentation = signal<(() => SidebarPresentation) | null>(null);

  setPresentationOverride(presentation: () => SidebarPresentation): () => void {
    this.temporaryPresentation.set(presentation);
    return () => {
      if (this.temporaryPresentation() === presentation) this.temporaryPresentation.set(null);
    };
  }
}
