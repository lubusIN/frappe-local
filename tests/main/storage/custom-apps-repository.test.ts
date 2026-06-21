import { describe, expect, it, beforeEach } from 'vitest';
import { CustomAppsRepository } from '../../../src/main/storage/repositories/custom-apps-repository';
import { StorageAdapter } from '../../../src/main/storage/adapter';
import type { StorageSnapshot } from '../../../src/main/storage/schema';
import type { CustomAppItem } from '../../../src/shared/domain/models';

class MockStorageAdapter implements StorageAdapter {
  private snapshot: StorageSnapshot;

  constructor(initialSnapshot: StorageSnapshot) {
    this.snapshot = initialSnapshot;
  }

  async readSnapshot(): Promise<StorageSnapshot> {
    return this.snapshot;
  }

  async transaction<T>(fn: (snapshot: StorageSnapshot) => Promise<{ snapshot: StorageSnapshot; result: T }>): Promise<T> {
    const { snapshot, result } = await fn(this.snapshot);
    this.snapshot = snapshot;
    return result;
  }
}

describe('CustomAppsRepository', () => {
  let adapter: MockStorageAdapter;
  let repository: CustomAppsRepository;

  const mockApp = {
    id: '123',
    name: 'test_app',
    title: 'Test App',
    description: 'A test custom app',
    type: 'github' as const,
    source: 'https://github.com/frappe/test_app',
    branch: 'main',
    icon: 'icon.png',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    adapter = new MockStorageAdapter({
      version: 1,
      benches: [],
      sites: [],
      customApps: [mockApp],
      settings: null,
    } as any);
    repository = new CustomAppsRepository(adapter);
  });

  it('should find all apps', async () => {
    const apps = await repository.findAll();
    expect(apps).toHaveLength(1);
    expect(apps[0]?.id).toBe('123');
  });

  it('should find app by id', async () => {
    const app = await repository.findById('123');
    expect(app?.id).toBe('123');

    const notFound = await repository.findById('456');
    expect(notFound).toBeNull();
  });

  it('should create an app', async () => {
    const app = await repository.create({
      name: 'new_app',
      title: 'New App',
      type: 'local',
      source: '/path/to/new_app',
    });

    expect(app.name).toBe('new_app');
    expect(app.id).toBeDefined();

    const snapshot = await adapter.readSnapshot();
    expect(snapshot.customApps).toHaveLength(2);
  });

  it('should update an app', async () => {
    const app = await repository.update('123', {
      title: 'Updated Test App',
    });

    expect(app?.title).toBe('Updated Test App');
    expect(app?.name).toBe('test_app');

    const snapshot = await adapter.readSnapshot();
    expect(snapshot.customApps?.[0]?.title).toBe('Updated Test App');
  });

  it('should return null when updating a non-existent app', async () => {
    const app = await repository.update('456', {
      title: 'Updated Test App',
    });

    expect(app).toBeNull();
  });

  it('should delete an app', async () => {
    const deleted = await repository.delete('123');
    expect(deleted).toBe(true);

    const snapshot = await adapter.readSnapshot();
    expect(snapshot.customApps).toHaveLength(0);
  });

  it('should return false when deleting a non-existent app', async () => {
    const deleted = await repository.delete('456');
    expect(deleted).toBe(false);

    const snapshot = await adapter.readSnapshot();
    expect(snapshot.customApps).toHaveLength(1);
  });
});
