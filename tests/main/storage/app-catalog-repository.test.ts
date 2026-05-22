import { describe, it, expect, beforeEach } from 'vitest';
import type { StorageAdapter } from '../../../src/main/storage/adapter';
import type { StorageSnapshot } from '../../../src/main/storage/schema';
import { createDefaultStorageSnapshot } from '../../../src/main/storage/schema';
import { AppCatalogRepository } from '../../../src/main/storage/repositories/app-catalog-repository';
import type { AppCatalogItem } from '../../../src/shared/domain/models';

const seedItems: AppCatalogItem[] = [
  {
    id: 'frappe',
    name: 'Frappe',
    description: 'The core framework',
    source: 'https://github.com/frappe/frappe',
    version: '15.0.0',
    category: 'core',
    compatibility: {},
  },
  {
    id: 'erpnext',
    name: 'ERPNext',
    description: 'Enterprise resource planning',
    source: 'https://github.com/frappe/erpnext',
    version: '15.0.0',
    category: 'business',
    compatibility: {},
  },
  {
    id: 'hrms',
    name: 'HRMS',
    description: 'Human resource management system',
    source: 'https://github.com/frappe/hrms',
    version: '15.0.0',
    category: 'business',
    compatibility: {},
  },
];

function makeInMemoryAdapter(items: AppCatalogItem[] = []): StorageAdapter {
  let current: StorageSnapshot = createDefaultStorageSnapshot(items);
  return {
    async connect() {},
    async close() {},
    async readSnapshot() { return current; },
    async writeSnapshot(snapshot) { current = snapshot; },
    async transaction(operation) {
      const { snapshot: updated, result } = await operation(current);
      current = updated;
      return result;
    },
  };
}

describe('AppCatalogRepository', () => {
  let repo: AppCatalogRepository;

  beforeEach(() => {
    repo = new AppCatalogRepository(makeInMemoryAdapter(seedItems));
  });

  it('findAll returns all catalog items', async () => {
    const items = await repo.findAll();
    expect(items).toHaveLength(3);
  });

  it('findById returns the correct item', async () => {
    const item = await repo.findById('erpnext');
    expect(item).not.toBeNull();
    expect(item!.name).toBe('ERPNext');
  });

  it('findById returns null for unknown id', async () => {
    expect(await repo.findById('unknown')).toBeNull();
  });

  it('search filters by name case-insensitively', async () => {
    const results = await repo.search('frappe');
    expect(results.map((r) => r.id)).toContain('frappe');
  });

  it('search filters by description', async () => {
    const results = await repo.search('enterprise');
    expect(results.map((r) => r.id)).toContain('erpnext');
  });

  it('search with empty string returns all items', async () => {
    const results = await repo.search('');
    expect(results).toHaveLength(3);
  });

  it('search with whitespace-only query returns all items', async () => {
    const results = await repo.search('   ');
    expect(results).toHaveLength(3);
  });

  it('findAll returns empty array when catalog is empty', async () => {
    const emptyRepo = new AppCatalogRepository(makeInMemoryAdapter([]));
    expect(await emptyRepo.findAll()).toEqual([]);
  });
});
