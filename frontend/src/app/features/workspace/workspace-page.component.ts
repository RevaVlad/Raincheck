import { Component } from '@angular/core';
import { GroupSidebarComponent } from './group-sidebar/group-sidebar.component';
import { PollEditorComponent } from './poll-editor/poll-editor.component';
import { PollEditorService } from './poll-editor/poll-editor.service';

@Component({
  selector: 'app-workspace-page',
  imports: [GroupSidebarComponent, PollEditorComponent],
  providers: [PollEditorService],
  templateUrl: './workspace-page.component.html',
})
export class WorkspacePageComponent {
  readonly groupName = 'Встречи команды CRM';
  readonly inviteLink = 'sverimsya.app/g/crm-7F3K9';
}
