import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, merge, of, Subject } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { RaincheckApiService, type Workspace } from '../../core/api/raincheck-api.service';
import { ParticipantSessionService } from '../../core/session/participant-session.service';

@Injectable()
export class GroupFacade {
  readonly inviteCode = signal('');
  readonly workspace = signal<Workspace | null>(null);
  readonly loading = signal(true);
  readonly joining = signal(false);
  readonly notFound = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly joinError = signal<string | null>(null);

  private readonly api = inject(RaincheckApiService);
  private readonly session = inject(ParticipantSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeInviteCodes = new Subject<string>();
  private readonly refresh = new Subject<void>();
  private joinVersion = 0;

  constructor() {
    merge(this.routeInviteCodes, this.refresh.pipe(map(() => this.inviteCode())))
      .pipe(
        tap((inviteCode) => this.beginLoad(inviteCode)),
        switchMap((inviteCode) => {
          if (!inviteCode) return of({ kind: 'missing' as const });
          const identity = this.session.get(inviteCode);
          return this.api.getWorkspace(inviteCode, identity?.token).pipe(
            map((workspace) => ({ kind: 'loaded' as const, inviteCode, identity, workspace })),
            catchError((error: unknown) => of({ kind: 'failed' as const, error })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result.kind === 'loaded') {
          if (!result.workspace.me && result.identity) this.session.clear(result.inviteCode);
          this.workspace.set(result.workspace);
        } else if (result.kind === 'missing') {
          this.notFound.set(true);
        } else if (RaincheckApiService.errorCode(result.error) === 'GROUP_NOT_FOUND') {
          this.notFound.set(true);
        } else {
          this.loadError.set(
            RaincheckApiService.errorMessage(
              result.error,
              'Не удалось загрузить группу. Попробуйте ещё раз.',
            ),
          );
        }
        this.loading.set(false);
      });
  }

  setInviteCode(inviteCode: string): void {
    if (inviteCode !== this.inviteCode()) this.routeInviteCodes.next(inviteCode);
  }

  reload(): void {
    this.refresh.next();
  }

  async join(displayName: string): Promise<void> {
    const inviteCode = this.inviteCode();
    const name = displayName.trim();
    if (!inviteCode || !name || this.joining()) return;

    const joinVersion = ++this.joinVersion;
    this.joining.set(true);
    this.joinError.set(null);
    try {
      const result = await firstValueFrom(this.api.joinGroup(inviteCode, { displayName: name }));
      const stored = this.session.store(inviteCode, {
        participantId: result.participant.id,
        token: result.participantEditToken,
      });
      if (inviteCode !== this.inviteCode()) return;
      if (!stored) {
        this.joinError.set(
          'Браузер не сохранил доступ участника. Включите локальное хранилище и попробуйте снова.',
        );
        return;
      }
      this.reload();
    } catch (error) {
      if (inviteCode !== this.inviteCode()) return;
      if (RaincheckApiService.errorCode(error) === 'GROUP_NOT_FOUND') {
        this.notFound.set(true);
      } else if (RaincheckApiService.errorCode(error) === 'PARTICIPANT_NAME_TAKEN') {
        this.joinError.set('Это имя уже используется в группе. Выберите другое.');
      } else {
        this.joinError.set(
          RaincheckApiService.errorMessage(error, 'Не удалось присоединиться к группе.'),
        );
      }
    } finally {
      if (joinVersion === this.joinVersion) this.joining.set(false);
    }
  }

  invalidateIdentity(inviteCode = this.inviteCode()): void {
    this.session.clear(inviteCode);
    if (inviteCode !== this.inviteCode()) return;
    this.workspace.update((workspace) => (workspace ? { ...workspace, me: null } : null));
    this.joinError.set('Сеанс участника завершился. Присоединитесь к группе ещё раз.');
  }

  private beginLoad(inviteCode: string): void {
    this.joinVersion += 1;
    this.joining.set(false);
    this.inviteCode.set(inviteCode);
    this.workspace.set(null);
    this.loading.set(true);
    this.notFound.set(false);
    this.loadError.set(null);
    this.joinError.set(null);
  }
}
