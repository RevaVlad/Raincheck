import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { AvailabilityGridComponent } from './availability-grid/availability-grid.component';
import { AvailabilityToolbarComponent } from './availability-toolbar/toolbar.component';
import { PollEditorService } from './poll-editor.service';
import type { AvailabilityKind, SaveState } from './poll-editor.service';

@Component({
  selector: 'app-poll-editor',
  imports: [MatButtonModule, MatCardModule, AvailabilityGridComponent, AvailabilityToolbarComponent],
  templateUrl: './poll-editor.component.html',
})
export class PollEditorComponent {
  readonly editor = inject(PollEditorService);

  select(kind: AvailabilityKind): void {
    this.editor.select(kind);
  }

  saveLabel(state: SaveState): string {
    const labels: Record<SaveState, string> = {
      LOADING: 'Загружаем ответ…',
      IDLE: 'Изменений нет',
      DIRTY: 'Есть несохранённые изменения',
      SAVING: 'Сохраняем…',
      SAVED: 'Сохранено',
      ERROR: 'Не удалось сохранить',
    };
    return labels[state];
  }

  confirm(): void {
    void this.editor.confirm();
  }

  retrySave(): void {
    void this.editor.saveNow().catch(() => undefined);
  }

  retryLoad(): void {
    void this.editor.retryLoad();
  }
}
