import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { PollEditorService } from './poll-editor/poll-editor.service';

@Component({
  selector: 'app-confirm-response-button',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './confirm-response-button.component.html',
})
export class ConfirmResponseButtonComponent {
  readonly editor = inject(PollEditorService);
  readonly inviteCode = input.required<string>();
  readonly pollId = input.required<string>();

  confirm(): void {
    void this.editor.confirm();
  }
}
