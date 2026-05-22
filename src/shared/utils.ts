/** Extract a human-readable message from any caught value. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
