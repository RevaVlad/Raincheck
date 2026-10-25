export { pollParams as responseParams } from '../common/params.schemas.js';

export const replaceIntervalsBody = {
  type: 'object',
  additionalProperties: false,
  required: ['intervals'],
  properties: {
    intervals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['startAt', 'endAt', 'kind', 'preferenceDirection'],
        properties: {
          startAt: { type: 'string', format: 'date-time', pattern: 'Z$' },
          endAt: { type: 'string', format: 'date-time', pattern: 'Z$' },
          kind: { type: 'string', enum: ['UNAVAILABLE', 'IF_NEEDED', 'PREFERRED'] },
          preferenceDirection: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;
