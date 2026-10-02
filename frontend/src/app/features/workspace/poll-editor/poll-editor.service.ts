import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RaincheckApiService, type ParticipantResponse, type Poll } from '../../../core/api/raincheck-api.service';
import { ParticipantSessionService } from '../../../core/session/participant-session.service';
import {
  availabilityCellKey,
  compressCellsToIntervals,
  expandIntervalsToCells,
  type AvailabilityCells,
  type SerializedAvailabilityInterval,
} from './availability-grid/availability-intervals';

export type AvailabilityKind = 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';
export type SaveState = 'LOADING' | 'IDLE' | 'DIRTY' | 'SAVING' | 'SAVED' | 'ERROR';

@Injectable()
export class PollEditorService {
  private readonly api = inject(RaincheckApiService);
  private readonly session = inject(ParticipantSessionService);
  readonly selectedKind = signal<AvailabilityKind>('PREFERRED');
  readonly cells = signal<AvailabilityCells>({});
  readonly poll = signal<Poll | null>(null);
  readonly responseId = signal<string | null>(null);
  readonly responseState = signal<ParticipantResponse['state']>('DRAFT');
  readonly responseLoaded = signal(false);
  readonly saveState = signal<SaveState>('IDLE');
  readonly lastSaveError = signal<string | null>(null);
  readonly label = computed(() => {
    const labels: Record<AvailabilityKind, string> = {
      UNAVAILABLE: 'Не могу',
      IF_NEEDED: 'Если понадобится',
      PREFERRED: 'Удобно',
    };
    return labels[this.selectedKind()];
  });

  private inviteCode = '';
  private token = '';
  private onUnauthorized = () => {};
  private loaded = false;
  private unauthorized = false;
  private dirty = false;
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;

  async load(
    inviteCode: string,
    poll: Poll,
    token: string,
    onUnauthorized: () => void,
  ): Promise<void> {
    this.clearTimer();
    this.inviteCode = inviteCode;
    this.token = token;
    this.onUnauthorized = onUnauthorized;
    this.loaded = false;
    this.responseLoaded.set(false);
    this.unauthorized = false;
    this.dirty = false;
    this.version = 0;
    this.poll.set(poll);
    this.cells.set({});
    this.responseId.set(null);
    this.responseState.set('DRAFT');
    this.saveState.set('LOADING');
    this.lastSaveError.set(null);

    try {
      const response = await firstValueFrom(this.api.getMyResponse(inviteCode, poll.id, token));
      this.applyResponse(response);
      this.cells.set(expandIntervalsToCells(response.intervals, poll.slotMinutes));
      this.loaded = true;
      this.responseLoaded.set(true);
      this.saveState.set('IDLE');
    } catch (error) {
      if (RaincheckApiService.errorCode(error) === 'RESPONSE_NOT_FOUND') {
        this.loaded = true;
        this.responseLoaded.set(true);
        this.saveState.set('IDLE');
        return;
      }
      this.lastSaveError.set(
        RaincheckApiService.errorMessage(error, 'Could not load your availability.'),
      );
      this.saveState.set('ERROR');
      if (this.isUnauthorized(error)) this.invalidateIdentity();
    }
  }

  select(kind: AvailabilityKind): void {
    this.selectedKind.set(kind);
  }

  retryLoad(): Promise<void> {
    const poll = this.poll();
    if (!poll || !this.inviteCode || !this.token) return Promise.resolve();
    return this.load(this.inviteCode, poll, this.token, this.onUnauthorized);
  }

  paint(localDate: string, startTime: string, kind: AvailabilityKind): void {
    if (!this.loaded || this.unauthorized) return;
    const key = availabilityCellKey(localDate, startTime);
    if (this.cells()[key] === kind) return;

    this.cells.update((cells) => ({ ...cells, [key]: kind }));
    this.version += 1;
    this.dirty = true;
    if (this.responseState() === 'CONFIRMED') this.responseState.set('DRAFT');
    this.saveState.set('DIRTY');
    this.lastSaveError.set(null);
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow().catch(() => undefined);
    }, 600);
  }

  cellAt(localDate: string, startTime: string): AvailabilityKind | null {
    return this.cells()[availabilityCellKey(localDate, startTime)] ?? null;
  }

  toIntervals(): SerializedAvailabilityInterval[] {
    return compressCellsToIntervals(this.cells(), this.poll()?.slotMinutes ?? 30);
  }

  async saveNow(): Promise<void> {
    this.clearTimer();
    if (!this.loaded || !this.dirty || this.unauthorized) return;
    if (this.inFlight) {
      await this.inFlight;
      if (this.dirty && this.saveState() !== 'ERROR') return this.saveNow();
      return;
    }

    const save = this.saveDirtySnapshots();
    this.inFlight = save;
    try {
      await save;
    } finally {
      if (this.inFlight === save) this.inFlight = null;
    }
  }

  async confirm(): Promise<void> {
    try {
      await this.saveNow();
      if (this.unauthorized || !this.responseId()) return;
      const response = await firstValueFrom(
        this.api.confirmMyResponse(this.inviteCode, this.poll()!.id, this.token),
      );
      this.applyResponse(response);
      this.saveState.set('SAVED');
      this.lastSaveError.set(null);
    } catch (error) {
      this.lastSaveError.set(RaincheckApiService.errorMessage(error, 'Could not confirm your response.'));
      this.saveState.set('ERROR');
      if (this.isUnauthorized(error)) this.invalidateIdentity();
    }
  }

  private async saveDirtySnapshots(): Promise<void> {
    while (this.dirty && !this.unauthorized) {
      const version = this.version;
      const intervals = this.toIntervals();
      this.saveState.set('SAVING');
      this.lastSaveError.set(null);
      try {
        if (!this.responseId()) {
          const created = await firstValueFrom(
            this.api.createMyResponse(this.inviteCode, this.poll()!.id, this.token),
          );
          this.applyResponse(created);
        }
        const saved = await firstValueFrom(
          this.api.replaceMyResponse(this.inviteCode, this.poll()!.id, this.token, { intervals }),
        );
        this.applyResponse(saved);
        this.dirty = this.version !== version;
        this.saveState.set(this.dirty ? 'DIRTY' : 'SAVED');
      } catch (error) {
        this.lastSaveError.set(RaincheckApiService.errorMessage(error, 'Could not save your changes.'));
        this.saveState.set('ERROR');
        if (this.isUnauthorized(error)) this.invalidateIdentity();
        throw error;
      }
    }
  }

  private applyResponse(response: ParticipantResponse): void {
    this.responseId.set(response.id);
    this.responseState.set(response.state);
  }

  private isUnauthorized(error: unknown): boolean {
    return (
      RaincheckApiService.errorCode(error) === 'UNAUTHORIZED' ||
      (error instanceof HttpErrorResponse && error.status === 401)
    );
  }

  private invalidateIdentity(): void {
    if (this.unauthorized) return;
    this.unauthorized = true;
    this.session.clear(this.inviteCode);
    this.onUnauthorized();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
