import { requireParticipant } from '#services/access/require-participant';
import { ApplicationError } from '#services/errors';
import { AppError } from './errors.js';
import { applicationErrorStatus } from './common/application-errors.js';

// Existing HTTP callers retain AppError; services use requireParticipant directly.
export async function resolveParticipant(...args: Parameters<typeof requireParticipant>) {
  try {
    return await requireParticipant(...args);
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw new AppError(error.code, applicationErrorStatus[error.code], error.message);
    }
    throw error;
  }
}
