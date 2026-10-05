import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from './core/header/app-header.component';
import { TimezoneConfirmationComponent } from './core/timezone/timezone-confirmation.component';

@Component({
  selector: 'app-root',
  imports: [AppHeaderComponent, RouterOutlet, TimezoneConfirmationComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
