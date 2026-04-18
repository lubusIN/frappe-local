import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageAdapter } from '../src/main/storage/adapter';
import type { StorageSnapshot } from '../src/main/storage/schema';
import { createDefaultStorageSnapshot } from '../src/main/storage/schema';
import { GroupRepository } from '../src/main/storage/repositories/group-repository';
import type { CreateGroupInput } from '../src/shared/domain/models';

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

const sampleInput: CreateGroupInput = {
  name: 'Production',
  description: 'Production sites',
  tags: ['prod'],
  siteIds: [],
};

describe('GroupRepository', () => {
  let adapter: StorageAdapter;
  let repo: GroupRepository;

  beforeEach(() => {
    adapter = makeInMemoryAdapter();
    repo = new GroupRepository(adapter);
  });

  it('returns empty list when no groups exist', async () => {
    expect(await repo.findAll()).toEqual([]);
  });

  it('creates a group and assigns an id', async () => {
    const group = await repo.create(sampleInput);
    expect(group.id).toBeTruthy();
    expect(group.name).toBe('Production');
    expect(group.siteIds).toEqual([]);
  });

  it('findAll returns all created groups', async () => {
    await repo.create(sampleInput);
    await repo.create({ ...sampleInput, name: 'Staging' });
    expect(await repo.findAll()).toHaveLength(2);
  });

  it('findById returns the correct group', async () => {
    const created = await repo.create(sampleInput);
    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('findById returns null for unknown id', async () => {
    expect(await repo.findById('missing')).toBeNull();
  });

  it('updates a group', async () => {
    const created = await repo.create(sampleInput);
    const updated = await repo.update(created.id, { name: 'Dev' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Dev');
    expect(updated!.description).toBe(sampleInput.description);
  });

  it('update returns null for unknown id', async () => {
    expect(await repo.update('missing', { name: 'X' })).toBeNull();
  });

  it('deletes an existing group and returns true', async () => {
    const created = await repo.create(sampleInput);
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });

  it('delete returns false for unknown id', async () => {
    expect(await repo.delete('missing')).toBe(false);
  });

  it('addSiteToGroup adds a site id', async () => {
    const group = await repo.create(sampleInput);
    const updated = await repo.addSiteToGroup(group.id, 'site-001');
    expect(updated!.siteIds).toContain('site-001');
  });

  it('addSiteToGroup does not duplicate site ids', async () => {
    const group = await repo.create(sampleInput);
    await repo.addSiteToGroup(group.id, 'site-001');
    await repo.addSiteToGroup(group.id, 'site-001');
    const found = await repo.findById(group.id);
    expect(found!.siteIds.filter((id) => id === 'site-001')).toHaveLength(1);
  });

  it('removeSiteFromGroup removes the site id', async () => {
    const group = await repo.create({ ...sampleInput, siteIds: ['site-001', 'site-002'] });
    const updated = await repo.removeSiteFromGroup(group.id, 'site-001');
    expect(updated!.siteIds).not.toContain('site-001');
    expect(updated!.siteIds).toContain('site-002');
  });

  it('removeSiteFromGroup returns null for unknown group', async () => {
    expect(await repo.removeSiteFromGroup('missing', 'site-001')).toBeNull();
  });
});
