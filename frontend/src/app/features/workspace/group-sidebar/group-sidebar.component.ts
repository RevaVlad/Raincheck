import { Clipboard } from '@angular/cdk/clipboard';
import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

interface Participant {
  initials: string;
  name: string;
  status: string;
  ready: boolean;
}

@Component({
  selector: 'app-group-sidebar',
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './group-sidebar.component.html',
  styleUrl: './group-sidebar.component.css',
})
export class GroupSidebarComponent {
  readonly groupName = input.required<string>();
  readonly inviteLink = input.required<string>();
  readonly copied = signal(false);
  readonly participants: Participant[] = [
    { initials: 'В', name: 'Влад', status: 'готово', ready: true },
    { initials: 'М', name: 'Маша', status: 'готово', ready: true },
    { initials: 'Д', name: 'Дима', status: 'редактирует', ready: false },
    { initials: 'Н', name: 'Никита', status: 'нет ответа', ready: false },
  ];
  private readonly clipboard = inject(Clipboard);

  copyInvite(): void {
    this.clipboard.copy(this.inviteLink());
    this.copied.set(true);
  }
}
