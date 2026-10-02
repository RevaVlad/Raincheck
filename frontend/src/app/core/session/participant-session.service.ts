import { Injectable } from '@angular/core';

export interface ParticipantIdentity {
  participantId: string;
  token: string;
}

@Injectable({ providedIn: 'root' })
export class ParticipantSessionService {
  get(inviteCode: string): ParticipantIdentity | null {
    try {
      const stored = localStorage.getItem(this.key(inviteCode));
      if (!stored) return null;
      let value: unknown;
      try {
        value = JSON.parse(stored);
      } catch {
        localStorage.removeItem(this.key(inviteCode));
        return null;
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        'participantId' in value &&
        typeof value.participantId === 'string' &&
        'token' in value &&
        typeof value.token === 'string'
      ) {
        return { participantId: value.participantId, token: value.token };
      }
      localStorage.removeItem(this.key(inviteCode));
    } catch {
      return null;
    }
    return null;
  }

  store(inviteCode: string, identity: ParticipantIdentity): boolean {
    try {
      localStorage.setItem(this.key(inviteCode), JSON.stringify(identity));
      return true;
    } catch {
      return false;
    }
  }

  clear(inviteCode: string): void {
    try {
      localStorage.removeItem(this.key(inviteCode));
    } catch {
      // Storage may be disabled; there is no durable identity to clear in that case.
    }
  }

  private key(inviteCode: string): string {
    return `raincheck.identity.${inviteCode}`;
  }
}
