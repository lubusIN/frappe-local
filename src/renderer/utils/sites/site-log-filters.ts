import type { LifecycleLogItem } from '../../../shared/core/ipc';

export type LogLevelFilter = 'all' | LifecycleLogItem['level'];

export const filterSiteLogs = (
  logs: readonly LifecycleLogItem[],
  query: string,
  level: LogLevelFilter
): LifecycleLogItem[] => {
  const normalizedQuery = query.trim().toLowerCase();

  return logs.filter((entry) => {
    const matchesLevel = level === 'all' ? true : entry.level === level;
    if (!matchesLevel) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return `${entry.message} ${entry.level}`.toLowerCase().includes(normalizedQuery);
  });
};
