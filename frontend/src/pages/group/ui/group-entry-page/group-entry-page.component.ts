import { Component, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import type { AvatarColor } from '@shared/api';
import { AVATAR_COLORS } from '../../lib/avatar-colors';
import { ErrorStateComponent } from '@shared/ui/error-state';
import { LoadingStateComponent } from '@shared/ui/loading-state';
import { GroupFacade } from '../../model/group-facade/group.facade';
import { GroupWorkspaceComponent } from '../group-workspace/group-workspace.component';

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
    GroupWorkspaceComponent,
  ],
  templateUrl: './group-entry-page.component.html',
})
export class GroupEntryPageComponent {
  readonly facade = inject(GroupFacade);
  readonly colors = AVATAR_COLORS;
  readonly profileRoute = inject(ActivatedRoute).snapshot.data['profile'] === true;
  displayName = '';
  avatarColor: AvatarColor = 'green';
  private profilePrefilled = false;
  private readonly router = inject(Router);

  @ViewChild(GroupWorkspaceComponent) private workspacePage?: GroupWorkspaceComponent;

  canLeave(): Promise<boolean> {
    return this.workspacePage?.canLeave() ?? Promise.resolve(true);
  }

  constructor() {
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

    const destination = this.profileDestination();
    if (await this.facade.saveProfile({ displayName, avatarColor: this.avatarColor })) {
      await this.router.navigate(destination);
    }
  }

  private profileDestination(): string[] {
    const workspace = this.facade.workspace();
    return !workspace?.me && !workspace?.currentPoll
      ? ['/g', this.facade.inviteCode(), 'polls', 'new']
      : ['/g', this.facade.inviteCode()];
  }
}
