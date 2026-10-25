import { AppError } from '../errors.js';

export async function validateCreateGroup(request: { body: unknown }): Promise<void> {
  const body = request.body;
  const hasUnknownFields =
    typeof body === 'object' && body !== null && Object.keys(body).some((key) => key !== 'name');
  if (hasUnknownFields) {
    throw new AppError('INVALID_REQUEST', 400, 'Only the group name is accepted');
  }
}
