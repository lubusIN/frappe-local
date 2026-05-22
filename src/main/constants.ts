/**
 * Application-wide constants and configuration defaults
 */

/**
 * Database credentials for bench operations
 * These are the default credentials used in the generated docker-compose template.
 */
export const DATABASE_CREDENTIALS = {
  /**
   * MariaDB password for bench operations
   * Default value used in frappe_docker docker-compose setup
   */
  DB_PASSWORD: '123',
  
  /**
   * Admin password for new Frappe site creation
   * Default password used when bootstrapping new sites
   */
  ADMIN_PASSWORD: 'admin',

  /**
   * MariaDB root username
   */
  DB_ROOT_USERNAME: 'root',

  /**
   * Default database hostname in docker-compose
   */
  DB_HOST: 'db',
} as const;

/**
 * Docker service names used in the generated bench docker-compose template.
 */
export const DOCKER_SERVICES = {
  /**
   * Main backend service for running bench commands
   */
  BACKEND: 'backend',
} as const;

/**
 * Timeout values for docker-compose operations (in milliseconds)
 */
export const OPERATION_TIMEOUTS = {
  /**
   * Standard timeout for most operations
   */
  DEFAULT: 30000,
  
  /**
   * Extended timeout for site creation
   */
  SITE_CREATION: 300000,

  /**
   * Extended timeout for image pull operations
   */
  IMAGE_PULL: 300000,

  /**
    * Base timeout for a single app fetch/build cycle.
    */
    APP_INSTALL_BASE: 900000,

    /**
   * Global ceiling for any bench app installation/removal.
    * Long enough for the slowest apps without allowing hour-long hangs.
   */
    APP_INSTALL: 1800000,

  /**
   * Extended timeout for site start/stop scheduler operations
   */
  SITE_STATUS_UPDATE: 180000,
  
  /**
   * Extended timeout for bench cleanup
   */
  BENCH_CLEANUP: 120000,

  /**
   * Extended timeout for stopping bench containers
   */
  BENCH_STOP: 180000,
  
  /**
   * Timeout for docker down/cleanup
   */
  DOCKER_CLEANUP: 30000,
} as const;
