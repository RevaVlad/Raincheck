import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, Observable } from 'rxjs';

import { apiErrorCode, apiErrorMessage, isUnauthorized } from '../../../../core/api/api-errors';
import type { ParticipantResponse, WorkspacePoll } from '../../../../core/api/api.types';

import { PollResponsesApiService } from './poll-responses-api.service';
import type { SerializedAvailabilityInterval } from './availability-grid/availability-intervals';
import { AvailabilityIntervalsService } from './availability-grid/availability-intervals.service';

export type AvailabilityKind = 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';

export type AvailabilityBrush = AvailabilityKind | 'CLEAR';

export type SaveState = 'LOADING' | 'IDLE' | 'DIRTY' | 'SAVING' | 'SAVED' | 'ERROR';

interface EditorContext {
  inviteCode: string;
  poll: WorkspacePoll;
  token: string;
  onUnauthorized: () => void;
}

const BRUSH_LABELS: Record<AvailabilityBrush, string> = {
  UNAVAILABLE: 'Не могу',
  IF_NEEDED: 'Если понадобится',
  PREFERRED: 'Удобно',
  CLEAR: 'Очистить',
};

const AUTOSAVE_DELAY = 600;

@Injectable()
export class PollEditorService {
  private readonly api = inject(PollResponsesApiService);
  private readonly availabilityIntervals = inject(AvailabilityIntervalsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedKind = signal<AvailabilityBrush>('PREFERRED');
  readonly poll = signal<WorkspacePoll | null>(null);

  readonly responseId = signal<string | null>(null);
  readonly responseState = signal<ParticipantResponse['state']>('DRAFT');
  readonly responseLoaded = signal(false);

  readonly saveState = signal<SaveState>('IDLE');
  readonly lastSaveError = signal<string | null>(null);

  private readonly dirty = signal(false);
  private readonly mutationCount = signal(0);

  readonly pendingChanges = computed(() => this.dirty() || this.mutationCount() > 0);

  readonly label = computed(() => BRUSH_LABELS[this.selectedKind()]);

  private context: EditorContext | null = null;

  private version = 0;
  private unauthorized = false;
  private paused = false;
  private leaving = false;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<void> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  async load(
    inviteCode: string,
    poll: WorkspacePoll,
    token: string,
    onUnauthorized: () => void,
  ): Promise<void> {
    const context: EditorContext = {
      inviteCode,
      poll,
      token,
      onUnauthorized,
    };

    this.context = context;
    this.reset(poll);

    try {
      const response = await this.request(this.api.getMyResponse(inviteCode, poll.id, token));

      if (!this.isCurrent(context)) return;

      this.applyResponse(response);
      this.availabilityIntervals.load(response.intervals, poll.slots);

      this.finishLoading();
    } catch (error) {
      if (!this.isCurrent(context)) return;

      if (apiErrorCode(error) === 'RESPONSE_NOT_FOUND') {
        this.finishLoading();
        return;
      }

      this.handleError(error, 'Could not load your availability.');
    }
  }

  retryLoad(): Promise<void> {
    const context = this.context;

    if (!this.isCurrent(context)) {
      return Promise.resolve();
    }

    return this.load(context.inviteCode, context.poll, context.token, context.onUnauthorized);
  }

  select(kind: AvailabilityBrush): void {
    this.selectedKind.set(kind);
  }

  paint(startAt: string, kind: AvailabilityBrush): void {
    if (!this.responseLoaded() || !this.context || this.leaving) {
      return;
    }

    if (!this.availabilityIntervals.paint(startAt, kind)) {
      return;
    }

    this.version++;
    this.dirty.set(true);

    if (this.responseState() === 'CONFIRMED') {
      this.responseState.set('DRAFT');
    }

    this.saveState.set('DIRTY');
    this.lastSaveError.set(null);

    this.scheduleSave();
  }

  cellAt(startAt: string): AvailabilityKind | null {
    return this.availabilityIntervals.cellAt(startAt);
  }

  toIntervals(): SerializedAvailabilityInterval[] {
    return this.availabilityIntervals.toIntervals(this.poll()?.slots ?? []);
  }

  pauseAutosave(): void {
    if (this.paused) return;

    this.paused = true;
    this.clearTimer();
  }

  resumeAutosave(): void {
    if (!this.paused) return;

    this.paused = false;

    if (this.dirty() && !this.leaving) {
      this.scheduleSave();
    }
  }

  beginLeaving(): void {
    this.leaving = true;
    this.pauseAutosave();
  }

  cancelLeaving(): void {
    this.leaving = false;
    this.resumeAutosave();
  }

  async saveNow(): Promise<void> {
    this.clearTimer();

    const context = this.context;

    if (!this.canSave(context)) {
      return;
    }

    if (this.savePromise) {
      return this.savePromise;
    }

    const promise = this.flush(context).finally(() => {
      if (this.savePromise === promise) {
        this.savePromise = null;
      }
    });

    this.savePromise = promise;

    return promise;
  }

  async confirm(): Promise<void> {
    const context = this.context;

    if (!this.isCurrent(context)) {
      return;
    }

    try {
      await this.saveNow();

      if (this.canConfirm(context)) await this.confirmSavedResponse(context);
    } catch (error) {
      if (!this.isCurrent(context)) return;

      this.handleError(error, 'Could not confirm your response.');
    }
  }

  private canConfirm(context: EditorContext): boolean {
    return this.isCurrent(context) && !this.dirty() && !!this.responseId();
  }

  private async confirmSavedResponse(context: EditorContext): Promise<void> {
    await this.withMutation(context, async () => {
      const response = await this.request(
        this.api.confirmMyResponse(context.inviteCode, context.poll.id, context.token),
      );

      if (!this.isCurrent(context)) return;

      this.applyResponse(response);
      this.saveState.set('SAVED');
      this.lastSaveError.set(null);
    });
  }

  private async flush(context: EditorContext): Promise<void> {
    await this.withMutation(context, async () => {
      while (this.canSave(context)) {
        await this.saveSnapshot(context);
      }
    });
  }

  private async saveSnapshot(context: EditorContext): Promise<void> {
    const version = this.version;
    const intervals = this.toIntervals();

    this.saveState.set('SAVING');
    this.lastSaveError.set(null);

    try {
      if (!(await this.ensureResponse(context))) {
        return;
      }

      const response = await this.request(
        this.api.replaceMyResponse(context.inviteCode, context.poll.id, context.token, {
          intervals,
        }),
      );

      if (!this.isCurrent(context)) return;

      this.applyResponse(response);

      this.dirty.set(this.version !== version);
      this.saveState.set(this.dirty() ? 'DIRTY' : 'SAVED');
    } catch (error) {
      if (this.isCurrent(context)) {
        this.handleError(error, 'Could not save your changes.');
      }

      throw error;
    }
  }

  private async ensureResponse(context: EditorContext): Promise<boolean> {
    if (this.responseId()) {
      return this.isCurrent(context);
    }

    const response = await this.request(
      this.api.createMyResponse(context.inviteCode, context.poll.id, context.token),
    );

    if (!this.isCurrent(context)) {
      return false;
    }

    this.applyResponse(response);

    return true;
  }

  private canSave(context: EditorContext | null): context is EditorContext {
    return (
      this.isCurrent(context) &&
      this.responseLoaded() &&
      this.dirty() &&
      !this.unauthorized &&
      !this.paused
    );
  }

  private async withMutation<T>(context: EditorContext, action: () => Promise<T>): Promise<T> {
    this.mutationCount.update((count) => count + 1);

    try {
      return await action();
    } finally {
      if (this.sameContext(context)) {
        this.mutationCount.update((count) => Math.max(0, count - 1));
      }
    }
  }

  private applyResponse(response: ParticipantResponse): void {
    this.responseId.set(response.id);
    this.responseState.set(response.state);
  }

  private finishLoading(): void {
    this.responseLoaded.set(true);
    this.saveState.set('IDLE');
  }

  private handleError(error: unknown, fallbackMessage: string): void {
    this.lastSaveError.set(apiErrorMessage(error, fallbackMessage));

    this.saveState.set('ERROR');

    if (isUnauthorized(error)) {
      this.invalidateIdentity();
    }
  }

  private invalidateIdentity(): void {
    if (this.unauthorized) return;

    this.unauthorized = true;
    this.context?.onUnauthorized();
  }

  private scheduleSave(delay = AUTOSAVE_DELAY): void {
    this.clearTimer();

    if (this.paused || this.leaving) {
      return;
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;

      void this.saveNow().catch(() => undefined);
    }, delay);
  }

  private clearTimer(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = null;
  }

  private reset(poll: WorkspacePoll): void {
    this.clearTimer();

    this.savePromise = null;
    this.paused = false;
    this.leaving = false;
    this.unauthorized = false;
    this.version = 0;

    this.dirty.set(false);
    this.mutationCount.set(0);

    this.poll.set(poll);
    this.availabilityIntervals.reset();

    this.responseId.set(null);
    this.responseState.set('DRAFT');
    this.responseLoaded.set(false);

    this.saveState.set('LOADING');
    this.lastSaveError.set(null);
  }

  private sameContext(context: EditorContext): boolean {
    return this.context === context;
  }

  private isCurrent(context: EditorContext | null): context is EditorContext {
    return context !== null && this.context === context && !this.leaving;
  }

  private request<T>(observable: Observable<T>): Promise<T> {
    return firstValueFrom(observable.pipe(takeUntilDestroyed(this.destroyRef)));
  }

  private cleanup(): void {
    this.context = null;
    this.clearTimer();
    this.savePromise = null;

    this.dirty.set(false);
    this.mutationCount.set(0);
  }
}
