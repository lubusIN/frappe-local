import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageAdapter } from '../../../src/main/storage/adapter';
import type { StorageSnapshot } from '../../../src/main/storage/schema';
import { createDefaultStorageSnapshot } from '../../../src/main/storage/schema';
import { SiteRepository } from '../../../src/main/storage/repositories/site-repository';
import type { CreateSiteInput } from '../../../src/shared/domain/models';

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

const sampleInput: CreateSiteInput = {
  name: 'test.localhost',
  benchId: 'bench-001',
  apps: ['frappe'],
  path: '/home/user/frappe-bench/sites/test.localhost',
};

describe('SiteRepository', () => {
  let adapter: StorageAdapter;
  let repo: SiteRepository;

  beforeEach(() => {
    adapter = makeInMemoryAdapter();
    repo = new SiteRepository(adapter);
  });

  it('returns empty list when no sites exist', async () => {
    const result = await repo.findAll();
    expect(result).toEqual([]);
  });

  it('creates a site and assigns an id and timestamps', async () => {
    const site = await repo.create(sampleInput);
    expect(site.id).toBeTruthy();
    expect(site.name).toBe('test.localhost');
    expect(site.timestamps.createdAt).toBeTruthy();
    expect(site.timestamps.updatedAt).toBeTruthy();
  });

  it('findAll returns all created sites', async () => {
    await repo.create(sampleInput);
    await repo.create({ ...sampleInput, name: 'second.localhost' });
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('findById returns the correct site', async () => {
    const created = await repo.create(sampleInput);
    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('findById returns null for unknown id', async () => {
    const found = await repo.findById('non-existent-id');
    expect(found).toBeNull();
  });

  it('findByBenchId returns only sites for that bench', async () => {
    await repo.create(sampleInput);
    await repo.create({ ...sampleInput, name: 'other.localhost', benchId: 'bench-002' });
    const results = await repo.findByBenchId('bench-001');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('test.localhost');
  });

  it('updates a site and refreshes updatedAt', async () => {
    const created = await repo.create(sampleInput);
    const before = created.timestamps.updatedAt;

    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(created.id, { status: 'running' });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('running');
    expect(updated!.timestamps.updatedAt).not.toBe(before);
    expect(updated!.timestamps.createdAt).toBe(created.timestamps.createdAt);
  });

  it('update returns null for unknown id', async () => {
    const result = await repo.update('missing', { status: 'running' });
    expect(result).toBeNull();
  });

  it('deletes an existing site and returns true', async () => {
    const created = await repo.create(sampleInput);
    const deleted = await repo.delete(created.id);
    expect(deleted).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('delete returns false for unknown id', async () => {
    const result = await repo.delete('non-existent-id');
    expect(result).toBe(false);
  });

  it('persists changes across multiple reads', async () => {
    const site = await repo.create(sampleInput);
    await repo.update(site.id, { name: 'renamed.localhost' });
    const found = await repo.findById(site.id);
    expect(found!.name).toBe('renamed.localhost');
  });
});
