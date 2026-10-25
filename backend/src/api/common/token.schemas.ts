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
