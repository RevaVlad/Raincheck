import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { PollEditorService } from './poll-editor/poll-editor.service';

@Component({
  selector: 'app-confirm-response-button',
  imports: [MatButtonModule],
  templateUrl: './confirm-response-button.component.html',
})
export class ConfirmResponseButtonComponent {
  readonly editor = inject(PollEditorService);

  confirm(): void {
    void this.editor.confirm();
  }
}
