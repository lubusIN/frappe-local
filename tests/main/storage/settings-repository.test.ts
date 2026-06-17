import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageAdapter } from '../../../src/main/storage/adapter';
import type { StorageSnapshot } from '../../../src/main/storage/schema';
import { createDefaultStorageSnapshot } from '../../../src/main/storage/schema';
import { SettingsRepository } from '../../../src/main/storage/repositories/settings-repository';
import type { Settings } from '../../../src/shared/domain/models';

function makeInMemoryAdapter(initial?: StorageSnapshot): StorageAdapter {
  let current: StorageSnapshot = initial ?? createDefaultStorageSnapshot([]);
  return {
    async connect() {},
    async close() {},
    async readSnapshot() {
      return current;
    },
    async writeSnapshot(snapshot) {
      current = snapshot;
    },
    async transaction(operation) {
      const { snapshot: updated, result } = await operation(current);
      current = updated;
      return result;
    },
  };
}

import { DEFAULT_SETTINGS } from '../../../src/shared/domain/models';

const fullSettings: Settings = {
  ...DEFAULT_SETTINGS,
  storagePath: '/home/user/.frappe-local',
};

describe('SettingsRepository', () => {
  let adapter: StorageAdapter;
  let repo: SettingsRepository;

  beforeEach(() => {
    adapter = makeInMemoryAdapter();
    repo = new SettingsRepository(adapter);
  });

  it('returns null when settings not yet configured', async () => {
    expect(await repo.get()).toBeNull();
  });

  it('set creates settings and returns the full object', async () => {
    const saved = await repo.set(fullSettings);
    expect(saved.defaultFrappeVersion).toBe('16.0.0');
    expect(saved.updateChannel).toBe('stable');
  });

  it('set persists settings to the snapshot', async () => {
    await repo.set(fullSettings);
    const retrieved = await repo.get();
    expect(retrieved).not.toBeNull();
  });

  it('set overwrites individual fields when called again', async () => {
    await repo.set(fullSettings);
  });

  it('patch updates a subset of fields', async () => {
    await repo.set(fullSettings);
    const patched = await repo.patch({ autoUpdateEnabled: false });
    expect(patched).not.toBeNull();
    expect(patched!.autoUpdateEnabled).toBe(false);
    expect(patched!.defaultFrappeVersion).toBe('16.0.0');
  });

  it('patch returns null when settings not yet configured', async () => {
    expect(await repo.patch({ autoUpdateEnabled: false })).toBeNull();
  });

  it('set rejects invalid updateChannel via Zod', async () => {
    await expect(
      repo.set({ ...fullSettings, updateChannel: 'nightly' as 'stable' })
    ).rejects.toThrow();
  });
});
