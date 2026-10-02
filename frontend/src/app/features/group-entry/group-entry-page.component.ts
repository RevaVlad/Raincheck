import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { WorkspacePageComponent } from '../workspace/workspace-page.component';

@Component({
  selector: 'app-group-entry-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    WorkspacePageComponent,
  ],
  templateUrl: './group-entry-page.component.html',
})
export class GroupEntryPageComponent {
  readonly joined = signal(false);
  displayName = '';
}
