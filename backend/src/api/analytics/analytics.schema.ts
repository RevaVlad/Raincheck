export const viewerTimeZoneSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['timeZone'],
  properties: { timeZone: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;
