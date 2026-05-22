type LogLevel = 'info' | 'warn' | 'error';

const formatMessage = (scope: string, level: LogLevel, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [renderer] [${scope}] [${level}] ${message}`;
};

export const createRendererLogger = (scope: string) => ({
  info: (message: string): void => {
    console.info(formatMessage(scope, 'info', message));
  },
  warn: (message: string): void => {
    console.warn(formatMessage(scope, 'warn', message));
  },
  error: (message: string, error?: unknown): void => {
    console.error(formatMessage(scope, 'error', message), error);
  },
});