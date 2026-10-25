export {
  participantTokenHeaders,
  optionalParticipantTokenHeaders,
} from './common/token.schemas.js';
export { inviteCodeParams } from './common/params.schemas.js';

export const apiErrorResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
      },
    },
  },
} as const;
