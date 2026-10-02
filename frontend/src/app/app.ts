import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TimezoneConfirmationComponent } from './core/timezone/timezone-confirmation.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TimezoneConfirmationComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
