import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GroupSidebarComponent } from '../group-sidebar/group-sidebar.component';
import { GroupSidebarContext } from '../../model/group-sidebar-context/group-sidebar-context.service';

@Component({
  imports: [GroupSidebarComponent, RouterOutlet],
  providers: [GroupSidebarContext],
  selector: 'app-group-shell',
  templateUrl: './group-shell.component.html',
})
export class GroupShellComponent {}
