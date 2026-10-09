import { Injectable } from '@angular/core';

export interface ParticipantIdentity {
  participantId: string;
  token: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isParticipantIdentity(value: unknown): value is ParticipantIdentity {
  const identity = record(value);
  return (
    identity !== null &&
    nonEmptyString(identity['participantId']) &&
    nonEmptyString(identity['token'])
  );
}

@Injectable({ providedIn: 'root' })
export class ParticipantSessionService {
  get(inviteCode: string): ParticipantIdentity | null {
    const key = this.key(inviteCode);
    let stored: string | null;
    try {
      stored = localStorage.getItem(key);
    } catch {
      return null;
    }
    if (stored === null) return null;

    try {
      const value: unknown = JSON.parse(stored);
      if (isParticipantIdentity(value)) {
        return { participantId: value.participantId, token: value.token };
      }
    } catch {
      // Remove malformed JSON below.
    }

    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can become unavailable between reading and cleaning it up.
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
      // Storage can become unavailable after the session was read.
    }
  }

  private key(inviteCode: string): string {
    return `raincheck.identity.${inviteCode}`;
  }
}
