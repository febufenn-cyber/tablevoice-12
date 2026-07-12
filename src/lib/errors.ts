export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = 'bad_request',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && error.message.startsWith('Invalid review transition:')) {
    return new AppError(error.message, 409, 'invalid_transition');
  }
  return new AppError(error instanceof Error ? error.message : 'Unexpected error', 500, 'internal_error');
}
