import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { RaincheckApiService, type Workspace } from '../../core/api/raincheck-api.service';
import { ParticipantSessionService } from '../../core/session/participant-session.service';
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
export class GroupEntryPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(RaincheckApiService);
  private readonly session = inject(ParticipantSessionService);

  readonly inviteCode = this.route.snapshot.paramMap.get('inviteCode') ?? '';
  readonly workspace = signal<Workspace | null>(null);
  readonly loading = signal(true);
  readonly joining = signal(false);
  readonly notFound = signal(false);
  readonly errorMessage = signal<string | null>(null);
  displayName = '';

  ngOnInit(): void {
    void this.loadWorkspace();
  }

  async loadWorkspace(): Promise<void> {
    if (!this.inviteCode) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.loading.set(true);
    this.notFound.set(false);
    this.errorMessage.set(null);
    const identity = this.session.get(this.inviteCode);
    try {
      const workspace = await firstValueFrom(
        this.api.getWorkspace(this.inviteCode, identity?.token),
      );
      if (!workspace.me && identity) this.session.clear(this.inviteCode);
      this.workspace.set(workspace);
    } catch (error) {
      if (RaincheckApiService.errorCode(error) === 'GROUP_NOT_FOUND') {
        this.notFound.set(true);
      } else {
        this.errorMessage.set(
          RaincheckApiService.errorMessage(error, 'Не удалось загрузить группу. Попробуйте ещё раз.'),
        );
      }
    } finally {
      this.loading.set(false);
    }
  }

  async join(): Promise<void> {
    const name = this.displayName.trim();
    if (!name || this.joining()) return;

    this.joining.set(true);
    this.errorMessage.set(null);
    try {
      const result = await firstValueFrom(
        this.api.joinGroup(this.inviteCode, { displayName: name }),
      );
      const stored = this.session.store(this.inviteCode, {
        participantId: result.participant.id,
        token: result.participantEditToken,
      });
      if (!stored) {
        this.errorMessage.set(
          'Браузер не сохранил доступ участника. Включите локальное хранилище и попробуйте снова.',
        );
        return;
      }
      await this.loadWorkspace();
    } catch (error) {
      if (RaincheckApiService.errorCode(error) === 'GROUP_NOT_FOUND') {
        this.notFound.set(true);
      } else if (RaincheckApiService.errorCode(error) === 'PARTICIPANT_NAME_TAKEN') {
        this.errorMessage.set('Это имя уже используется в группе. Выберите другое.');
      } else {
        this.errorMessage.set(
          RaincheckApiService.errorMessage(error, 'Не удалось присоединиться к группе.'),
        );
      }
    } finally {
      this.joining.set(false);
    }
  }

  returnToJoin(): void {
    this.session.clear(this.inviteCode);
    this.workspace.update((workspace) => (workspace ? { ...workspace, me: null } : null));
    this.errorMessage.set('Сеанс участника завершился. Присоединитесь к группе ещё раз.');
  }
}
