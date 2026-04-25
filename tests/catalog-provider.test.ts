import { describe, expect, it } from 'vitest';
import { getDefaultAppCatalogSeed, normalizeCatalogProviderItem } from '../src/main/catalog-provider';

describe('catalog provider normalization', () => {
  it('normalizes id casing and strips unsupported runtimes', () => {
    const normalized = normalizeCatalogProviderItem({
      id: ' ERPNext ',
      name: ' ERPNext ',
      description: ' ERP platform ',
      source: ' https://github.com/frappe/erpnext ',
      version: ' 15.0.0 ',
      category: 'business',
      compatibility: {
        
      },
    });

    expect(normalized.id).toBe('erpnext');
    expect(normalized.name).toBe('ERPNext');
  });

  it('returns a normalized default catalog seed', () => {
    const seed = getDefaultAppCatalogSeed();

    expect(seed.length).toBeGreaterThan(0);
    expect(seed[0]?.id).toBe(seed[0]?.id.toLowerCase());
  });
});
