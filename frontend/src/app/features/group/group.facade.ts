import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiErrorCode, apiErrorMessage } from '../../core/api/api-errors';
import type { JoinResponse, Workspace } from '../../core/api/api.types';
import {
  ParticipantSessionService,
  type ParticipantIdentity,
} from '../../core/session/participant-session.service';
import { GroupsApiService } from './groups-api.service';
import { ParticipantsApiService } from './participants-api.service';

interface JoinContext {
  inviteCode: string;
  version: number;
}

interface WorkspaceParams {
  inviteCode: string;
  identity: ParticipantIdentity | null;
}

@Injectable()
export class GroupFacade {
  readonly inviteCode = signal('');
  readonly joining = signal(false);
  readonly joinError = signal<string | null>(null);

  private readonly groupsApi = inject(GroupsApiService);
  private readonly participantsApi = inject(ParticipantsApiService);
  private readonly session = inject(ParticipantSessionService);
  private readonly loadVersion = signal(0);
  private readonly identityInvalidated = signal(false);
  private readonly joinNotFound = signal(false);
  private joinVersion = 0;
  private leaveCheck: (() => Promise<boolean>) | null = null;

  private readonly workspaceParams = computed<WorkspaceParams | undefined>(() => {
    const inviteCode = this.inviteCode();
    void this.loadVersion();
    return inviteCode ? { inviteCode, identity: this.session.get(inviteCode) } : undefined;
  });

  readonly workspaceResource = this.groupsApi.workspaceResource(() => {
    const params = this.workspaceParams();
    return params ? { inviteCode: params.inviteCode, token: params.identity?.token } : undefined;
  });

  readonly workspace = computed(() => this.readWorkspace());

  readonly loading = computed(
    () =>
      !!this.inviteCode() &&
      (this.workspaceResource.isLoading() ||
        (!this.workspaceResource.hasValue() && this.workspaceResource.error() === undefined)),
  );
  readonly notFound = computed(
    () =>
      !this.inviteCode() ||
      this.joinNotFound() ||
      apiErrorCode(this.workspaceResource.error()) === 'GROUP_NOT_FOUND',
  );
  readonly loadError = computed(() => {
    const error = this.workspaceResource.error();
    return error && apiErrorCode(error) !== 'GROUP_NOT_FOUND'
      ? apiErrorMessage(error, 'Не удалось загрузить группу. Попробуйте ещё раз.')
      : null;
  });

  constructor() {
    effect(() => this.clearStaleIdentity());
  }

  setInviteCode(inviteCode: string): void {
    if (inviteCode === this.inviteCode()) return;
    this.joinVersion += 1;
    this.joining.set(false);
    this.inviteCode.set(inviteCode);
    this.identityInvalidated.set(false);
    this.joinNotFound.set(false);
    this.joinError.set(null);
  }

  registerLeaveCheck(check: () => Promise<boolean>): () => void {
    this.leaveCheck = check;
    return () => {
      if (this.leaveCheck === check) this.leaveCheck = null;
    };
  }

  confirmLeave(): Promise<boolean> {
    return this.leaveCheck?.() ?? Promise.resolve(true);
  }

  reload(): void {
    this.loadVersion.update((version) => version + 1);
  }

  async join(displayName: string): Promise<void> {
    const inviteCode = this.inviteCode();
    const name = displayName.trim();
    if (!this.canJoin(inviteCode, name)) return;

    const context = { inviteCode, version: ++this.joinVersion };
    this.joining.set(true);
    this.joinNotFound.set(false);
    this.joinError.set(null);
    try {
      const result = await firstValueFrom(
        this.participantsApi.joinGroup(inviteCode, { displayName: name }),
      );
      if (this.isCurrentJoin(context)) this.completeJoin(context, result);
    } catch (error) {
      if (this.isCurrentJoin(context)) this.handleJoinError(error);
    } finally {
      if (context.version === this.joinVersion) this.joining.set(false);
    }
  }

  invalidateIdentity(inviteCode = this.inviteCode()): void {
    this.session.clear(inviteCode);
    if (inviteCode !== this.inviteCode()) return;
    this.identityInvalidated.set(true);
    this.joinError.set('Сеанс участника завершился. Присоединитесь к группе ещё раз.');
  }

  private readWorkspace(): Workspace | null {
    if (!this.workspaceIsReady()) return null;
    const workspace = this.workspaceResource.value();
    if (!workspace) return null;
    return this.identityInvalidated() ? { ...workspace, me: null } : workspace;
  }

  private workspaceIsReady(): boolean {
    return (
      !this.workspaceResource.isLoading() &&
      this.workspaceResource.error() === undefined &&
      this.workspaceResource.hasValue()
    );
  }

  private clearStaleIdentity(): void {
    const params = this.workspaceParams();
    if (!this.shouldClearStaleIdentity(params)) return;
    if (!this.workspaceResource.value()?.me) this.session.clear(params.inviteCode);
  }

  private shouldClearStaleIdentity(params: WorkspaceParams | undefined): params is WorkspaceParams {
    return !!params?.identity && this.workspaceIsReady();
  }

  private canJoin(inviteCode: string, name: string): boolean {
    return !!inviteCode && !!name && !this.joining();
  }

  private isCurrentJoin(context: JoinContext): boolean {
    return context.inviteCode === this.inviteCode() && context.version === this.joinVersion;
  }

  private completeJoin(context: JoinContext, result: JoinResponse): void {
    const stored = this.session.store(context.inviteCode, {
      participantId: result.participant.id,
      token: result.participantEditToken,
    });
    if (!stored) {
      this.joinError.set(
        'Браузер не сохранил доступ участника. Включите локальное хранилище и попробуйте снова.',
      );
      return;
    }
    this.identityInvalidated.set(false);
    this.reload();
  }

  private handleJoinError(error: unknown): void {
    const code = apiErrorCode(error);
    if (code === 'GROUP_NOT_FOUND') {
      this.joinNotFound.set(true);
    } else if (code === 'PARTICIPANT_NAME_TAKEN') {
      this.joinError.set('Это имя уже используется в группе. Выберите другое.');
    } else {
      this.joinError.set(apiErrorMessage(error, 'Не удалось присоединиться к группе.'));
    }
  }
}
