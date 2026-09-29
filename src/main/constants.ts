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
  FRAPPE: 'frappe', // Main frappe service for running bench commands and processes
} as const;

/**
 * Timeouts for bench local operations
 */
const MINUTE_MS = 60_000;

export const IDLE_TIMEOUT_MS = 10 * MINUTE_MS; // 10 minutes of silence
export const MAX_WALL_CLOCK_MS = 45 * MINUTE_MS; // 45 minutes absolute limit

/**
 * Short-running operations (like quick file ops or quick health checks)
 */
export const QUICK_IDLE_TIMEOUT_MS = 30_000; // 30s
export const QUICK_MAX_TIMEOUT_MS = 60_000; // 1m

/**
 * Standard-running operations (like pip install or migrations)
 */
export const STANDARD_IDLE_TIMEOUT_MS = 60_000; // 1m
export const STANDARD_MAX_TIMEOUT_MS = 120_000; // 2m

/**
 * Task cancellation ceilings (after this point, a stuck task can be force-killed via UI)
 */
export const TASK_CANCELLABLE_AFTER_MS = 30_000; // 30s
export const MIGRATE_TASK_CANCELLABLE_AFTER_MS = 120_000; // 2m

/**
 * Timeouts used while initializing and checking the Podman runtime.
 */
export const PODMAN_RUNTIME_TIMEOUTS = {
  MACHINE_INIT_IDLE: 5 * MINUTE_MS,
  MACHINE_INIT_MAX: 30 * MINUTE_MS,
  MACHINE_COMMAND: 2 * MINUTE_MS,
  ENGINE_READY: 90_000,
  ENGINE_POLL_INTERVAL: 2_000,
} as const;
