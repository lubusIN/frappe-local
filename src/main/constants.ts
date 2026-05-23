/**
 * Application-wide constants and configuration defaults
 */

/**
 * Database credentials for bench operations
 * These are the default credentials used in the generated docker-compose template.
 */
export const DATABASE_CREDENTIALS = {
  DB_PASSWORD: '123',
  ADMIN_PASSWORD: 'admin',
  DB_ROOT_USERNAME: 'root',
  DB_HOST: 'db',
} as const;

/**
 * Docker service names used in the generated bench docker-compose template.
 */
export const DOCKER_SERVICES = {
  BACKEND: 'backend', // Main backend service for running bench commands
} as const;

/**
 * Timeouts for bench local operations
 */
const MINUTE_MS = 60_000;

export const IDLE_TIMEOUT_MS = 10 * MINUTE_MS; // 10 minutes of silence
export const MAX_WALL_CLOCK_MS = 45 * MINUTE_MS; // 45 minutes absolute limit
