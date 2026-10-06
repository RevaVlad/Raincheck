import { Component, ViewChild, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { AVATAR_COLORS } from '../../core/api/avatar-colors';
import type { AvatarColor } from '../../core/api/api.types';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { ErrorStateComponent } from '../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../shared/presentation/loading-state.component';
import { GroupFacade } from '../group/group.facade';
import { GroupSidebarComponent } from '../workspace/group-sidebar/group-sidebar.component';
import { WorkspacePageComponent } from '../workspace/workspace-page.component';

@Component({
  selector: 'app-group-entry-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    ErrorStateComponent,
    LoadingStateComponent,
    GroupSidebarComponent,
    WorkspacePageComponent,
  ],
  templateUrl: './group-entry-page.component.html',
})
export class GroupEntryPageComponent {
  readonly facade = inject(GroupFacade);
  readonly timezone = inject(TimezonePreferenceService);
  private readonly document = inject(DOCUMENT);
  readonly colors = AVATAR_COLORS;
  readonly profileRoute = inject(ActivatedRoute).snapshot.data['profile'] === true;
  displayName = '';
  avatarColor: AvatarColor = 'green';
  private profilePrefilled = false;
  private readonly router = inject(Router);

  inviteLink(): string {
    const origin = this.document.location?.origin ?? '';
    return `${origin}/g/${encodeURIComponent(this.facade.inviteCode())}`;
  }

  @ViewChild(WorkspacePageComponent) private workspacePage?: WorkspacePageComponent;

  canLeave(): Promise<boolean> {
    return this.workspacePage?.canLeave() ?? Promise.resolve(true);
  }

  constructor() {
    void this.timezone.ensureConfirmed();
    effect(() => {
      const me = this.facade.workspace()?.me;
      if (!this.profileRoute || !me || this.profilePrefilled) return;
      this.displayName = me.displayName;
      this.avatarColor = me.avatarColor;
      this.profilePrefilled = true;
    });
  }

  async submitProfile(): Promise<void> {
    const displayName = this.displayName.trim();
    if (!displayName || this.facade.savingProfile()) return;

    if (await this.facade.saveProfile({ displayName, avatarColor: this.avatarColor })) {
      await this.router.navigate(['/g', this.facade.inviteCode()]);
    }
  }
}
