import { describe, expect, it } from 'vitest';
import { getDefaultAppCatalogSeed, normalizeCatalogProviderItem } from '../../../src/main/services/catalog-provider';

describe('catalog provider normalization', () => {
  it('normalizes id casing and strips unsupported runtimes', () => {
    const normalized = normalizeCatalogProviderItem({
      id: ' ERPNext ',
      name: ' ERPNext ',
      description: ' ERP platform ',
      source: ' https://github.com/frappe/erpnext ',
      installBranch: ' develop ',
      installBranches: {
        ' version-16 ': ' main ',
      },
      version: ' 15.0.0 ',
      category: 'business',
      compatibility: {
        supportedBenchVersions: [' version-16 ', ' develop '],
      },
    });

    expect(normalized.id).toBe('erpnext');
    expect(normalized.name).toBe('ERPNext');
    expect(normalized.installBranch).toBe('develop');
    expect(normalized.installBranches?.['version-16']).toBe('main');
    expect(normalized.compatibility.supportedBenchVersions).toEqual(['version-16', 'develop']);
  });

  it('returns a normalized default catalog seed', () => {
    const seed = getDefaultAppCatalogSeed();
    const builder = seed.find((item) => item.id === 'builder');
    const helpdesk = seed.find((item) => item.id === 'helpdesk');
    const wiki = seed.find((item) => item.id === 'wiki');

    expect(seed.length).toBeGreaterThan(0);
    expect(seed[0]?.id).toBe(seed[0]?.id.toLowerCase());
    expect(builder?.installBranch).toBe('master');
    expect(builder?.installBranches?.['version-16']).toBe('master');
    expect(helpdesk?.version).toMatch(/^v?\d+\.\d+\.\d+$/);
    expect(helpdesk?.installBranches?.['version-16']).toBe('main');
    expect(wiki?.installBranches?.['version-16']).toBeTruthy();
    expect(helpdesk?.compatibility.supportedBenchVersions).toEqual(['version-15', 'version-16', 'develop']);
  });
});
