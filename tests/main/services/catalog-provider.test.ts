import { describe, expect, it } from 'vitest';
import { getDefaultAppCatalogSeed, normalizeCatalogProviderItem } from '../../../src/main/services/catalog-provider';

describe('catalog provider normalization', () => {
  it('normalizes id casing and maps categories properly', () => {
    const normalized = normalizeCatalogProviderItem({
      slug: ' ERPNext ',
      title: ' ERPNext ',
      description: ' ERP platform ',
      repository: ' https://github.com/frappe/erpnext ',
      install_branches: {
        ' 16 ': ' main ',
      },
      categories: ['Business'],
      frappe_versions: [' 16 ', ' develop '],
    });

    expect(normalized.id).toBe('erpnext');
    expect(normalized.name).toBe('ERPNext');
    expect(normalized.installBranches?.['version-16']).toBe('main');
    expect(normalized.compatibility.supportedBenchVersions).toEqual(['version-16', 'develop']);
    expect(normalized.category).toBe('business');
    expect(normalized.version).toBe('latest');
  });

  it('handles empty properties gracefully', () => {
    const normalized = normalizeCatalogProviderItem({
      slug: 'minimal',
      title: 'Minimal App',
      description: '',
      repository: 'https://github.com/frappe/minimal',
    });

    expect(normalized.id).toBe('minimal');
    expect(normalized.category).toBe('other');
    expect(normalized.description).toBe('No description available.');
    expect(normalized.version).toBe('latest');
  });
});
