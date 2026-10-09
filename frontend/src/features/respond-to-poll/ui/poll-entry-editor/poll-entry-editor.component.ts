import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ErrorStateComponent } from '@shared/ui/error-state';
import { LoadingStateComponent } from '@shared/ui/loading-state';
import { AvailabilityGridComponent } from '../availability-grid/availability-grid.component';
import { AvailabilityToolbarComponent } from '../availability-toolbar/availability-toolbar.component';
import { PollEditorService } from '../../model/poll-editor/poll-editor.service';
import type { AvailabilityBrush } from '../../model/availability.types';

@Component({
  selector: 'app-poll-entry-editor',
  imports: [
    MatButtonModule,
    MatCardModule,
    AvailabilityGridComponent,
    AvailabilityToolbarComponent,
    ErrorStateComponent,
    LoadingStateComponent,
  ],
  templateUrl: './poll-entry-editor.component.html',
})
export class PollEntryEditorComponent {
  readonly editor = inject(PollEditorService);

  select(kind: AvailabilityBrush): void {
    this.editor.select(kind);
  }

  retrySave(): void {
    void this.editor.saveNow().catch(() => undefined);
  }

  retryLoad(): void {
    void this.editor.retryLoad();
  }
}
