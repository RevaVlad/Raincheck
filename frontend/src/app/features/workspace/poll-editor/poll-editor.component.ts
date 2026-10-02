import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { AvailabilityGridComponent } from './availability-grid/availability-grid.component';
import { AvailabilityToolbarComponent } from './availability-toolbar/toolbar.component';
import { AvailabilityKind, PollEditorService } from './poll-editor.service';

@Component({
  selector: 'app-poll-editor',
  imports: [MatCardModule, AvailabilityGridComponent, AvailabilityToolbarComponent],
  templateUrl: './poll-editor.component.html',
})
export class PollEditorComponent {
  readonly editor = inject(PollEditorService);
  select(kind: AvailabilityKind): void {
    this.editor.select(kind);
  }
}
