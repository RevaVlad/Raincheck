import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TimezonePreferenceService } from './timezone-preference.service';

@Component({
  selector: 'app-timezone-confirmation',
  imports: [FormsModule],
  template: `
    @if (timezone.promptOpen()) {
      <div
        class="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
        role="presentation"
      >
        <section
          class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="timezone-title"
        >
          <h2 id="timezone-title" class="text-xl font-semibold">Подтвердите часовой пояс</h2>
          <p class="mt-2 text-sm text-slate-600">
            Время опросов будет показано в выбранном часовом поясе.
          </p>
          <label class="mt-5 block text-sm font-medium" for="timezone">Часовой пояс</label>
          <select
            id="timezone"
            class="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3"
            [ngModel]="timezone.selectedTimeZone()"
            (ngModelChange)="timezone.selectedTimeZone.set($event)"
          >
            @for (zone of timezone.timeZones; track zone) {
              <option [value]="zone">{{ zone }}</option>
            }
          </select>
          <button
            class="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white"
            type="button"
            (click)="timezone.confirm()"
          >
            Подтвердить
          </button>
        </section>
      </div>
    }
  `,
})
export class TimezoneConfirmationComponent {
  readonly timezone = inject(TimezonePreferenceService);
}
