import path from 'node:path';
import os from 'node:os';
import type { AppRepositories } from '../ipc';
import type { LifecycleLogItem } from '@frappe-local/shared/core';
import type { Settings } from '@frappe-local/shared/domain';

export const byCreatedAtDesc = <T extends { timestamps: { createdAt: string } }>(left: T, right: T): number =>
  right.timestamps.createdAt.localeCompare(left.timestamps.createdAt);

export const toLifecycleLogs = (
  entityId: string,
  entityName: string,
  status: 'queued' | 'running' | 'stopped' | 'success' | 'failure' | 'ready',
  path: string,
  createdAt: string,
  updatedAt: string
): LifecycleLogItem[] => {
  const logs: LifecycleLogItem[] = [
    {
      id: `${entityId}-created`,
      entityId,
      level: 'info',
      message: `Entity "${entityName}" created at ${path}`,
      timestamp: createdAt,
    },
    {
      id: `${entityId}-status-${status}`,
      entityId,
      level: 'info',
      message: `Status of "${entityName}" updated to ${status}`,
      timestamp: updatedAt,
    },
  ];

  return logs;
};

export const getCurrentSettings = async (repository: AppRepositories['settings']): Promise<Settings | null> => {
  if (repository.get) {
    return repository.get();
  }

  const settings = await repository.findAll?.();
  return settings?.[0] ?? null;
};

export const resolveUserPath = (untrimmedPath: string): string => {
  if (typeof untrimmedPath !== 'string') {
    return '';
  }
  const trimmedPath = untrimmedPath.trim();
  if (trimmedPath.startsWith('~')) {
    return path.join(os.homedir(), trimmedPath.slice(1));
  }

  return path.resolve(trimmedPath);
};
