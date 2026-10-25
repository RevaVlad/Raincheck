export const inviteCodeParams = {
  type: 'object',
  additionalProperties: false,
  required: ['inviteCode'],
  properties: {
    inviteCode: { type: 'string', minLength: 32, maxLength: 64, pattern: '^[A-Za-z0-9_-]+$' },
  },
} as const;

export const pollParams = {
  type: 'object',
  additionalProperties: false,
  required: ['inviteCode', 'pollId'],
  properties: { ...inviteCodeParams.properties, pollId: { type: 'string' } },
} as const;
