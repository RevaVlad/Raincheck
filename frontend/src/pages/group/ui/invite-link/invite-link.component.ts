import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-invite-link',
  imports: [MatButtonModule, MatCardModule],
  templateUrl: './invite-link.component.html',
})
export class InviteLinkComponent {
  readonly inviteLink = input.required<string>();
  readonly copied = signal(false);
  private readonly clipboard = inject(Clipboard);

  copyInvite(): void {
    if (this.clipboard.copy(this.inviteLink())) this.copied.set(true);
  }
}
