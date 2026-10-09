import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { PollEditorService } from '../../model/poll-editor/poll-editor.service';
import type { AvailabilityBrush } from '../../model/availability.types';

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
