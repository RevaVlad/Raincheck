import type { FastifyRequest } from 'fastify';

export function logEvent(
  request: FastifyRequest,
  event: string,
  fields: Record<string, string | number> = {},
): void {
  request.log.info({ event, ...fields }, event);
}
