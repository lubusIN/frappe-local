/** Extract a human-readable message from any caught value. */
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const CORE_APP_ID = 'frappe';

export const filterNonCoreApps = <T extends string>(apps: readonly T[]): T[] =>
  apps.filter((app) => app !== CORE_APP_ID);
