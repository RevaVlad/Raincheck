import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { AvailabilityBrush, PollEditorService, SaveState } from '../poll-editor.service';

@Component({
  selector: 'app-availability-toolbar',
  imports: [MatButtonToggleModule],
  templateUrl: './availability-toolbar.component.html',
})
export class AvailabilityToolbarComponent {
  readonly selectedKind = input.required<AvailabilityBrush>();
  readonly selectKind = output<AvailabilityBrush>();
  readonly editor = inject(PollEditorService);
}
