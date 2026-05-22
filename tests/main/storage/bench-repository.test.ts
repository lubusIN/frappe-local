import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageAdapter } from '../../../src/main/storage/adapter';
import type { StorageSnapshot } from '../../../src/main/storage/schema';
import { createDefaultStorageSnapshot } from '../../../src/main/storage/schema';
import { BenchRepository } from '../../../src/main/storage/repositories/bench-repository';
import type { CreateBenchInput } from '../../../src/shared/domain/models';

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

const sampleInput: CreateBenchInput = {
  name: 'test-bench',
  path: '/home/user/frappe-bench',
  frappeVersion: '15.0.0',
  apps: ['frappe'],
};

describe('BenchRepository', () => {
  let adapter: StorageAdapter;
  let repo: BenchRepository;

  beforeEach(() => {
    adapter = makeInMemoryAdapter();
    repo = new BenchRepository(adapter);
  });

  it('returns empty list when no benches exist', async () => {
    const result = await repo.findAll();
    expect(result).toEqual([]);
  });

  it('creates a bench and assigns an id and timestamps', async () => {
    const bench = await repo.create(sampleInput);
    expect(bench.id).toBeTruthy();
    expect(bench.name).toBe('test-bench');
    expect(bench.timestamps.createdAt).toBeTruthy();
    expect(bench.timestamps.updatedAt).toBeTruthy();
  });

  it('findAll returns all created benches', async () => {
    await repo.create(sampleInput);
    await repo.create({ ...sampleInput, name: 'second-bench' });
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });

  it('findById returns the correct bench', async () => {
    const created = await repo.create(sampleInput);
    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('findById returns null for unknown id', async () => {
    const found = await repo.findById('non-existent-id');
    expect(found).toBeNull();
  });

  it('updates a bench and refreshes updatedAt', async () => {
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

  it('deletes an existing bench and returns true', async () => {
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
    const bench = await repo.create(sampleInput);
    await repo.update(bench.id, { name: 'renamed-bench' });
    const found = await repo.findById(bench.id);
    expect(found!.name).toBe('renamed-bench');
  });
});
