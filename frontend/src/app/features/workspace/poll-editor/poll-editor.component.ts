import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ErrorStateComponent } from '../../../shared/presentation/error-state.component';
import { LoadingStateComponent } from '../../../shared/presentation/loading-state.component';
import { AvailabilityGridComponent } from './availability-grid/availability-grid.component';
import { AvailabilityToolbarComponent } from './availability-toolbar/toolbar.component';
import { PollEditorService } from './poll-editor.service';
import type { AvailabilityBrush } from './poll-editor.service';

@Component({
  selector: 'app-poll-editor',
  imports: [
    MatButtonModule,
    MatCardModule,
    AvailabilityGridComponent,
    AvailabilityToolbarComponent,
    ErrorStateComponent,
    LoadingStateComponent,
  ],
  templateUrl: './poll-editor.component.html',
})
export class PollEditorComponent {
  readonly editor = inject(PollEditorService);

  select(kind: AvailabilityBrush): void {
    this.editor.select(kind);
  }

  confirm(): void {
    void this.editor.confirm();
  }

  retrySave(): void {
    void this.editor.saveNow().catch(() => undefined);
  }

  retryLoad(): void {
    void this.editor.retryLoad();
  }
}
