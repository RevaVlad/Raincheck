import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiErrorCode, apiErrorMessage, isUnauthorized } from '../../core/api/api-errors';
import type { JoinResponse, ParticipantInput, Workspace } from '../../core/api/api.types';
import {
  ParticipantSessionService,
  type ParticipantIdentity,
} from '../../core/session/participant-session.service';
import { ParticipantsApiService } from './entry/participants-api.service';
import { GroupWorkspaceApiService } from './workspace/group-workspace-api.service';

interface ProfileContext {
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
  readonly savingProfile = signal(false);
  readonly profileError = signal<string | null>(null);

  private readonly groupsApi = inject(GroupWorkspaceApiService);
  private readonly participantsApi = inject(ParticipantsApiService);
  private readonly session = inject(ParticipantSessionService);
  private readonly loadVersion = signal(0);
  private readonly identityInvalidated = signal(false);
  private readonly profileNotFound = signal(false);
  private profileVersion = 0;
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
      this.profileNotFound() ||
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
    this.profileVersion += 1;
    this.savingProfile.set(false);
    this.inviteCode.set(inviteCode);
    this.identityInvalidated.set(false);
    this.profileNotFound.set(false);
    this.profileError.set(null);
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

  refreshWorkspace(): Promise<Workspace> {
    const inviteCode = this.inviteCode();
    const identity = this.session.get(inviteCode);
    return firstValueFrom(this.groupsApi.getWorkspace(inviteCode, identity?.token));
  }

  async saveProfile(input: ParticipantInput): Promise<boolean> {
    const inviteCode = this.inviteCode();
    const displayName = input.displayName.trim();
    if (!this.canSaveProfile(inviteCode, displayName)) return false;

    const context = this.beginProfileSave(inviteCode);
    const identity = this.currentProfileIdentity(inviteCode);

    try {
      const body = { displayName, avatarColor: input.avatarColor };
      if (!(await this.persistProfile(context, identity, body))) return false;
      if (!this.isCurrentProfile(context)) return false;
      this.identityInvalidated.set(false);
      this.reload();
      return true;
    } catch (error) {
      this.handleProfileError(error, context, identity !== null);
      return false;
    } finally {
      this.finishProfileSave(context);
    }
  }

  invalidateIdentity(inviteCode = this.inviteCode()): void {
    this.session.clear(inviteCode);
    if (inviteCode !== this.inviteCode()) return;
    this.identityInvalidated.set(true);
    this.profileError.set('Сеанс участника завершился. Заполните профиль ещё раз.');
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
    if (!params?.identity || !this.workspaceIsReady()) return;
    if (!this.workspaceResource.value()?.me) this.session.clear(params.inviteCode);
  }

  private isCurrentProfile(context: ProfileContext): boolean {
    return context.inviteCode === this.inviteCode() && context.version === this.profileVersion;
  }

  private canSaveProfile(inviteCode: string, displayName: string): boolean {
    return !!inviteCode && !!displayName && !this.savingProfile();
  }

  private beginProfileSave(inviteCode: string): ProfileContext {
    this.savingProfile.set(true);
    this.profileError.set(null);
    this.profileNotFound.set(false);
    return { inviteCode, version: ++this.profileVersion };
  }

  private currentProfileIdentity(inviteCode: string): ParticipantIdentity | null {
    const me = this.workspace()?.me;
    const identity = this.session.get(inviteCode);
    return me && identity?.participantId === me.id ? identity : null;
  }

  private async persistProfile(
    context: ProfileContext,
    identity: ParticipantIdentity | null,
    body: ParticipantInput,
  ): Promise<boolean> {
    if (identity) {
      await firstValueFrom(
        this.participantsApi.updateProfile(context.inviteCode, identity.token, body),
      );
      return true;
    }

    const result = await firstValueFrom(this.participantsApi.joinGroup(context.inviteCode, body));
    return this.isCurrentProfile(context) && this.storeCreatedIdentity(context, result);
  }

  private storeCreatedIdentity(context: ProfileContext, result: JoinResponse): boolean {
    const stored = this.session.store(context.inviteCode, {
      participantId: result.participant.id,
      token: result.participantEditToken,
    });
    if (stored) return true;

    this.profileError.set(
      'Браузер не сохранил доступ участника. Включите локальное хранилище и попробуйте снова.',
    );
    return false;
  }

  private handleProfileError(error: unknown, context: ProfileContext, wasUpdate: boolean): void {
    if (!this.isCurrentProfile(context)) return;

    this.setProfileError(error, context, wasUpdate);
  }

  private setProfileError(error: unknown, context: ProfileContext, wasUpdate: boolean): void {
    const code = apiErrorCode(error);
    if (code === 'GROUP_NOT_FOUND') {
      this.profileNotFound.set(true);
      return;
    }
    if (code === 'PARTICIPANT_NAME_TAKEN') {
      this.profileError.set('Это имя уже используется в группе. Выберите другое.');
      return;
    }
    if (this.isUnauthorizedProfileUpdate(error, code, wasUpdate)) {
      this.invalidateUpdatedIdentity(context);
      return;
    }
    this.profileError.set(apiErrorMessage(error, 'Не удалось сохранить профиль.'));
  }

  private isUnauthorizedProfileUpdate(
    error: unknown,
    code: ReturnType<typeof apiErrorCode>,
    wasUpdate: boolean,
  ): boolean {
    return wasUpdate && (code === 'UNAUTHORIZED' || isUnauthorized(error));
  }

  private invalidateUpdatedIdentity(context: ProfileContext): void {
    this.session.clear(context.inviteCode);
    this.identityInvalidated.set(true);
    this.profileError.set('Не удалось подтвердить участника. Заполните профиль ещё раз.');
    this.reload();
  }

  private finishProfileSave(context: ProfileContext): void {
    if (context.version === this.profileVersion) this.savingProfile.set(false);
  }
}
