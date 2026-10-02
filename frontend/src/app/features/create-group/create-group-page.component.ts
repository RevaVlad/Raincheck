import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-create-group-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './create-group-page.component.html',
  styleUrl: './create-group-page.component.css',
})
export class CreateGroupPageComponent {
  readonly form = new FormGroup({
    groupName: new FormControl('Встречи команды CRM'),
    creatorName: new FormControl('Влад'),
    startsOn: new FormControl('2026-10-06'),
    endsOn: new FormControl('2026-10-12'),
    dayStart: new FormControl('16:00'),
    dayEnd: new FormControl('23:00'),
    slotMinutes: new FormControl('30'),
  });
}
