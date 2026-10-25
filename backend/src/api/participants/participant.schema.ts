import { AVATAR_COLORS } from '#domain/participant/participant';

export const participantBody = {
  type: 'object',
  additionalProperties: false,
  required: ['displayName', 'avatarColor'],
  properties: {
    displayName: { type: 'string', minLength: 1, maxLength: 80 },
    avatarColor: { type: 'string', enum: AVATAR_COLORS },
  },
} as const;

export { participantTokenHeaders } from '../common/token.schemas.js';
