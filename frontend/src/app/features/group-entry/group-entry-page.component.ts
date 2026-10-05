import { Component, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TimezoneDisplayPipe } from '../../core/timezone/timezone-display.pipe';
import { TimezonePreferenceService } from '../../core/timezone/timezone-preference.service';
import { ErrorStateComponent } from '../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../shared/presentation/loading-state.component';
import { GroupFacade } from '../group/group.facade';
import { WorkspacePageComponent } from '../workspace/workspace-page.component';

@Component({
  selector: 'app-group-entry-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    ErrorStateComponent,
    LoadingStateComponent,
    TimezoneDisplayPipe,
    WorkspacePageComponent,
  ],
  templateUrl: './group-entry-page.component.html',
})
export class GroupEntryPageComponent {
  readonly facade = inject(GroupFacade);
  readonly timezone = inject(TimezonePreferenceService);
  displayName = '';
  @ViewChild(WorkspacePageComponent) private workspacePage?: WorkspacePageComponent;

  canLeave(): Promise<boolean> {
    return this.workspacePage?.canLeave() ?? Promise.resolve(true);
  }

  constructor() {
    void this.timezone.ensureConfirmed();
  }
}
