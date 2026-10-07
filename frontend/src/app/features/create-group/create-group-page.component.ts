import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-errors';
import { GroupsApiService } from '../../core/api/groups-api.service';

@Component({
  selector: 'app-create-group-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './create-group-page.component.html',
  styleUrl: './create-group-page.component.css',
})
export class CreateGroupPageComponent {
  private readonly api = inject(GroupsApiService);
  private readonly router = inject(Router);
  readonly submitting = signal(false);
  readonly created = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = new FormGroup({ groupName: new FormControl('') });

  async submit(): Promise<void> {
    const name = this.validGroupName();
    if (!name) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const result = await firstValueFrom(this.api.createGroup({ name }));
      this.created.set(true);
      await this.router.navigate(['/g', result.group.inviteCode, 'profile']);
    } catch (error) {
      this.errorMessage.set(apiErrorMessage(error, 'Не удалось создать группу.'));
    } finally {
      this.submitting.set(false);
    }
  }

  private validGroupName(): string | null {
    if (this.submitting() || this.created()) return null;
    const name = this.form.controls.groupName.value?.trim() ?? '';
    if (!name) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Введите название группы.');
      return null;
    }
    return name;
  }
}
