import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { isUnauthorized, apiErrorCode, apiErrorMessage } from '../../../core/api/api-errors';
import type { ParticipantResponse, Poll } from '../../../core/api/api.types';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { PollResponsesApiService } from './poll-responses-api.service';
import {
  availabilityCellKey,
  compressCellsToIntervals,
  expandIntervalsToCells,
  type AvailabilityCells,
  type SerializedAvailabilityInterval,
} from './availability-grid/availability-intervals';

export type AvailabilityKind = 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';
export type AvailabilityBrush = AvailabilityKind | 'CLEAR';
export type SaveState = 'LOADING' | 'IDLE' | 'DIRTY' | 'SAVING' | 'SAVED' | 'ERROR';

interface EditorContext {
  inviteCode: string;
  pollId: string;
  token: string;
  generation: number;
}

@Injectable()
export class PollEditorService {
  private readonly api = inject(PollResponsesApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly selectedKind = signal<AvailabilityBrush>('PREFERRED');
  readonly cells = signal<AvailabilityCells>({});
  readonly poll = signal<Poll | null>(null);
  readonly responseId = signal<string | null>(null);
  readonly responseState = signal<ParticipantResponse['state']>('DRAFT');
  readonly responseLoaded = signal(false);
  readonly saveState = signal<SaveState>('IDLE');
  readonly lastSaveError = signal<string | null>(null);
  private readonly dirty = signal(false);
  private readonly mutationCount = signal(0);
  readonly pendingChanges = computed(() => this.dirty() || this.mutationCount() > 0);
  readonly label = computed(() => {
    const labels: Record<AvailabilityKind, string> = {
      UNAVAILABLE: 'Не могу',
      IF_NEEDED: 'Если понадобится',
      PREFERRED: 'Удобно',
    };
    return this.selectedKind() === 'CLEAR'
      ? 'Очистить'
      : labels[this.selectedKind() as AvailabilityKind];
  });

  private context: EditorContext | null = null;
  private onUnauthorized = () => {};
  private loaded = false;
  private unauthorized = false;
  private version = 0;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt = 0;
  private inFlight: { context: EditorContext; promise: Promise<void> } | null = null;
  private loadCancel = new Subject<void>();
  private paused = false;
  private leaving = false;
  private destroyed = false;
  private pauseSnapshot: { remaining: number | null; retryAfterCancel: boolean } | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  async load(
    inviteCode: string,
    poll: Poll,
    token: string,
    onUnauthorized: () => void,
  ): Promise<void> {
    const context = this.startLoad(inviteCode, poll, token, onUnauthorized);
    try {
      const response = await firstValueFrom(
        this.api.getMyResponse(inviteCode, poll.id, token).pipe(takeUntil(this.loadCancel)),
      );
      this.finishLoad(response, context, poll);
    } catch (error) {
      this.handleLoadError(error, context);
    }
  }

  private startLoad(
    inviteCode: string,
    poll: Poll,
    token: string,
    onUnauthorized: () => void,
  ): EditorContext {
    this.clearTimer();
    this.cancelLoad();
    const context: EditorContext = {
      inviteCode,
      pollId: poll.id,
      token,
      generation: ++this.generation,
    };
    this.context = context;
    this.leaving = false;
    this.paused = false;
    this.pauseSnapshot = null;
    this.onUnauthorized = onUnauthorized;
    this.loaded = false;
    this.unauthorized = false;
    this.version = 0;
    this.dirty.set(false);
    this.mutationCount.set(0);
    this.inFlight = null;
    this.responseLoaded.set(false);
    this.poll.set(poll);
    this.cells.set({});
    this.responseId.set(null);
    this.responseState.set('DRAFT');
    this.saveState.set('LOADING');
    this.lastSaveError.set(null);
    return context;
  }

  private finishLoad(response: ParticipantResponse, context: EditorContext, poll: Poll): void {
    if (!this.isCurrent(context)) return;
    this.applyResponse(response, context);
    this.cells.set(expandIntervalsToCells(response.intervals, poll.slotMinutes));
    this.loaded = true;
    this.responseLoaded.set(true);
    this.saveState.set('IDLE');
  }

  private handleLoadError(error: unknown, context: EditorContext): void {
    if (!this.isCurrent(context)) return;
    if (apiErrorCode(error) === 'RESPONSE_NOT_FOUND') {
      this.loaded = true;
      this.responseLoaded.set(true);
      this.saveState.set('IDLE');
      return;
    }
    this.lastSaveError.set(apiErrorMessage(error, 'Could not load your availability.'));
    this.saveState.set('ERROR');
    if (isUnauthorized(error)) this.invalidateIdentity();
  }

  select(kind: AvailabilityBrush): void {
    this.selectedKind.set(kind);
  }

  retryLoad(): Promise<void> {
    const context = this.context;
    const poll = this.poll();
    if (!context || !poll || !this.isCurrent(context)) return Promise.resolve();
    return this.load(context.inviteCode, poll, context.token, this.onUnauthorized);
  }

  paint(localDate: string, startTime: string, kind: AvailabilityBrush): void {
    if (!this.loaded || !this.context || !this.isCurrent(this.context)) return;
    if (!this.updateCell(localDate, startTime, kind)) return;
    this.version += 1;
    this.dirty.set(true);
    if (this.responseState() === 'CONFIRMED') this.responseState.set('DRAFT');
    this.saveState.set('DIRTY');
    this.lastSaveError.set(null);
    this.scheduleSave(600);
  }

  private updateCell(localDate: string, startTime: string, kind: AvailabilityBrush): boolean {
    const key = availabilityCellKey(localDate, startTime);
    if (kind === 'CLEAR') {
      if (!(key in this.cells())) return false;
      this.cells.update((cells) => {
        const { [key]: _removed, ...remaining } = cells;
        return remaining;
      });
    } else {
      if (this.cells()[key] === kind) return false;
      this.cells.update((cells) => ({ ...cells, [key]: kind }));
    }
    return true;
  }

  cellAt(localDate: string, startTime: string): AvailabilityKind | null {
    return this.cells()[availabilityCellKey(localDate, startTime)] ?? null;
  }

  toIntervals(): SerializedAvailabilityInterval[] {
    return compressCellsToIntervals(this.cells(), this.poll()?.slotMinutes ?? 30);
  }

  pauseAutosave(): void {
    if (this.paused) return;
    const remaining = this.timer === null ? null : Math.max(0, this.timerDueAt - Date.now());
    this.pauseSnapshot = {
      remaining,
      retryAfterCancel: this.dirty() && this.inFlight !== null,
    };
    this.clearTimer();
    this.paused = true;
  }

  resumeAutosave(): void {
    if (!this.paused) return;
    this.paused = false;
    const snapshot = this.pauseSnapshot;
    this.pauseSnapshot = null;
    if (this.dirty() && !this.leaving && snapshot) this.restorePausedSave(snapshot);
  }

  private restorePausedSave(snapshot: {
    remaining: number | null;
    retryAfterCancel: boolean;
  }): void {
    if (snapshot.remaining !== null) {
      this.scheduleSave(snapshot.remaining);
      return;
    }
    if (!snapshot.retryAfterCancel || this.inFlight !== null) return;
    this.scheduleSave(600);
  }

  beginLeaving(): void {
    this.pauseAutosave();
    this.leaving = true;
    this.cancelLoad();
  }

  cancelLeaving(): void {
    this.leaving = false;
    this.resumeAutosave();
  }

  async saveNow(): Promise<void> {
    const context = this.context;
    this.clearTimer();
    if (!context || !this.canSave(context)) return;
    const pending = this.inFlight;
    if (pending?.context === context) return this.waitForSave(context, pending.promise);

    const save = this.saveDirtySnapshots(context);
    this.inFlight = { context, promise: save };
    try {
      await save;
    } finally {
      this.finishSave(context, save);
    }
  }

  private canSave(context: EditorContext): boolean {
    return (
      this.loaded && this.dirty() && !this.unauthorized && !this.paused && this.isCurrent(context)
    );
  }

  private async waitForSave(context: EditorContext, pending: Promise<void>): Promise<void> {
    await pending;
    if (!this.isCurrent(context)) return;
    if (this.dirty() && this.saveState() !== 'ERROR') return this.saveNow();
  }

  private finishSave(context: EditorContext, save: Promise<void>): void {
    if (this.inFlight?.promise === save && this.sameContext(context)) this.inFlight = null;
  }

  async confirm(): Promise<void> {
    const context = this.context;
    if (!this.canConfirm(context)) return;
    try {
      await this.saveNow();
      if (!this.isCurrent(context) || this.dirty() || !this.responseId()) return;
      await this.confirmResponse(context);
    } catch (error) {
      this.handleConfirmError(error, context);
    }
  }

  private canConfirm(context: EditorContext | null): context is EditorContext {
    return context !== null && this.isCurrent(context);
  }

  private async confirmResponse(context: EditorContext): Promise<void> {
    this.mutationCount.update((count) => count + 1);
    try {
      const response = await firstValueFrom(
        this.api.confirmMyResponse(context.inviteCode, context.pollId, context.token),
      );
      if (!this.isCurrent(context)) return;
      this.applyResponse(response, context);
      this.saveState.set('SAVED');
      this.lastSaveError.set(null);
    } finally {
      if (this.sameContext(context)) this.mutationCount.update((count) => Math.max(0, count - 1));
    }
  }

  private handleConfirmError(error: unknown, context: EditorContext): void {
    if (!this.isCurrent(context)) return;
    this.lastSaveError.set(apiErrorMessage(error, 'Could not confirm your response.'));
    this.saveState.set('ERROR');
    if (isUnauthorized(error)) this.invalidateIdentity();
  }

  private async saveDirtySnapshots(context: EditorContext): Promise<void> {
    if (!this.isCurrent(context)) return;
    this.mutationCount.update((count) => count + 1);
    try {
      while (this.canContinueSaving(context)) await this.saveSnapshot(context);
    } finally {
      if (this.sameContext(context)) this.mutationCount.update((count) => Math.max(0, count - 1));
    }
  }

  private canContinueSaving(context: EditorContext): boolean {
    return this.isCurrent(context) && this.dirty() && !this.unauthorized;
  }

  private async saveSnapshot(context: EditorContext): Promise<void> {
    const version = this.version;
    const intervals = this.toIntervals();
    this.saveState.set('SAVING');
    this.lastSaveError.set(null);
    try {
      if (!(await this.ensureResponse(context))) return;
      const saved = await firstValueFrom(
        this.api.replaceMyResponse(context.inviteCode, context.pollId, context.token, {
          intervals,
        }),
      );
      if (!this.isCurrent(context)) return;
      this.applyResponse(saved, context);
      this.dirty.set(this.version !== version);
      this.saveState.set(this.dirty() ? 'DIRTY' : 'SAVED');
    } catch (error) {
      this.handleSaveError(error, context);
      throw error;
    }
  }

  private async ensureResponse(context: EditorContext): Promise<boolean> {
    if (this.responseId()) return this.isCurrent(context);
    const created = await firstValueFrom(
      this.api.createMyResponse(context.inviteCode, context.pollId, context.token),
    );
    if (!this.isCurrent(context)) return false;
    this.applyResponse(created, context);
    return true;
  }

  private handleSaveError(error: unknown, context: EditorContext): void {
    if (!this.isCurrent(context)) return;
    this.lastSaveError.set(apiErrorMessage(error, 'Could not save your changes.'));
    this.saveState.set('ERROR');
    if (isUnauthorized(error)) this.invalidateIdentity();
  }

  private applyResponse(response: ParticipantResponse, context: EditorContext): void {
    if (!this.isCurrent(context)) return;
    this.responseId.set(response.id);
    this.responseState.set(response.state);
  }

  private invalidateIdentity(): void {
    if (this.unauthorized) return;
    this.unauthorized = true;
    this.onUnauthorized();
  }

  private scheduleSave(delay: number): void {
    this.clearTimer();
    if (this.paused || this.leaving || this.destroyed) return;
    this.timerDueAt = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerDueAt = 0;
      void this.saveNow().catch(() => undefined);
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.timerDueAt = 0;
  }

  private cancelLoad(): void {
    this.loadCancel.next();
    this.loadCancel.complete();
    this.loadCancel = new Subject<void>();
  }

  private sameContext(context: EditorContext): boolean {
    return (
      this.context === context &&
      this.context.generation === context.generation &&
      this.context.inviteCode === context.inviteCode &&
      this.context.pollId === context.pollId &&
      this.context.token === context.token &&
      !this.destroyed
    );
  }

  private isCurrent(context: EditorContext): boolean {
    return this.sameContext(context) && !this.leaving;
  }

  private cleanup(): void {
    this.destroyed = true;
    this.context = null;
    this.clearTimer();
    this.cancelLoad();
    this.dirty.set(false);
    this.mutationCount.set(0);
    this.inFlight = null;
  }
}
