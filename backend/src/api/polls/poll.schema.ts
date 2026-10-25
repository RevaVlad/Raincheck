export const pollBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'startsOn',
    'endsOn',
    'dayStart',
    'dayEnd',
    'slotMinutes',
    'meetingDurationMinutes',
    'timeZone',
  ],
  properties: {
    title: { type: ['string', 'null'], maxLength: 160 },
    startsOn: { type: 'string' },
    endsOn: { type: 'string' },
    dayStart: { type: 'string' },
    dayEnd: { type: 'string' },
    slotMinutes: { type: 'integer', enum: [30, 60] },
    meetingDurationMinutes: { type: 'integer', minimum: 30, maximum: 240 },
    timeZone: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;
