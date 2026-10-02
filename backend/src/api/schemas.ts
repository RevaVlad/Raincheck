export const participantTokenHeaders = {
  type: 'object',
  additionalProperties: false,
  required: ['x-participant-token'],
  properties: {
    'x-participant-token': { type: 'string', minLength: 32, maxLength: 128 },
  },
} as const;

export const optionalParticipantTokenHeaders = {
  type: 'object',
  additionalProperties: false,
  properties: {
    'x-participant-token': { type: 'string', maxLength: 128 },
  },
} as const;

export const inviteCodeParams = {
  type: 'object',
  additionalProperties: false,
  required: ['inviteCode'],
  properties: {
    inviteCode: { type: 'string', minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
  },
} as const;

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
