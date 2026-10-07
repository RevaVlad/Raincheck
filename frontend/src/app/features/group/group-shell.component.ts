import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GroupSidebarComponent } from './sidebar/group-sidebar.component';
import { GroupSidebarContext } from './group-sidebar-context.service';

@Component({
  imports: [GroupSidebarComponent, RouterOutlet],
  providers: [GroupSidebarContext],
  selector: 'app-group-shell',
  templateUrl: './group-shell.component.html',
})
export class GroupShellComponent {}
