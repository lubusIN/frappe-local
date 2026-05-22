import { describe, expect, it } from 'vitest';
import { filterAndSortCatalog, getCatalogSourceHosts } from '../../../src/renderer/utils/catalog/catalog-query';

const catalog = [
  {
    id: 'frappe',
    name: 'Frappe',
    description: 'Core framework',
    source: 'https://github.com/frappe/frappe',
    version: '15.0.0',
    category: 'core',
    compatibility: {
      
    },
  },
  {
    id: 'erpnext',
    name: 'ERPNext',
    description: 'ERP app',
    source: 'https://github.com/frappe/erpnext',
    version: '15.1.0',
    category: 'business',
    compatibility: {
      
    },
  },
  {
    id: 'payments',
    name: 'Payments',
    description: 'Payments module',
    source: 'https://gitlab.example.com/frappe/payments',
    version: '14.9.0',
    category: 'business',
    compatibility: {
      
    },
  },
] as const;

describe('catalog query utilities', () => {
  it('filters by query and source host', () => {
    const result = filterAndSortCatalog(catalog, {
      query: 'erp',
      sourceHost: 'github.com',
      category: '',
      sort: 'name-asc',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('erpnext');
  });

  it('sorts by version descending', () => {
    const result = filterAndSortCatalog(catalog, {
      query: '',
      sourceHost: '',
      category: '',
      sort: 'version-desc',
    });

    expect(result.map((item) => item.id)).toEqual(['erpnext', 'frappe', 'payments']);
  });

  it('extracts unique source hosts', () => {
    expect(getCatalogSourceHosts(catalog)).toEqual(['github.com', 'gitlab.example.com']);
  });
});
