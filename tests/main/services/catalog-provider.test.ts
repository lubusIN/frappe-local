import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchBreweryCatalog, normalizeCatalogProviderItem, syncAppCatalogFromBrewery } from '../../../src/main/services/catalog-provider';
import { DEFAULT_BREWERY_URL } from '../../../src/shared/domain/models';

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

describe('fetchBreweryCatalog and syncAppCatalogFromBrewery', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetchBreweryCatalog tries /index/apps.json and normalizes apps', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        apps: [
          {
            slug: 'custom-app',
            title: 'Custom App',
            description: 'Custom app description',
            repository: 'https://github.com/custom/app',
          },
        ],
      }),
    });

    const result = await fetchBreweryCatalog('https://my-custom-brewery.local/');
    expect(result.success).toBe(true);
    expect(result.apps).toHaveLength(1);
    expect(result.apps[0]?.id).toBe('custom-app');
    expect(global.fetch).toHaveBeenCalledWith('https://my-custom-brewery.local/index/apps.json', expect.any(Object));
  });

  it('syncAppCatalogFromBrewery falls back to DEFAULT_BREWERY_URL when custom URL fails', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (url.includes('failing-url')) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      return {
        ok: true,
        json: async () => ({
          apps: [
            {
              slug: 'fallback-app',
              title: 'Fallback App',
              description: 'Fallback description',
              repository: 'https://github.com/frappe/fallback',
            },
          ],
        }),
      };
    });

    const syncedApps: unknown[] = [];
    const mockRepo = {
      sync: async (apps: unknown[]) => {
        syncedApps.push(...apps);
      },
    };

    const result = await syncAppCatalogFromBrewery('https://failing-url.local', mockRepo as any);
    expect(result.success).toBe(true);
    expect(result.apps[0]?.id).toBe('fallback-app');
    expect(syncedApps).toHaveLength(1);
  });

  it('cacheCatalogIcons converts remote http/https icon URLs to base64 data URIs', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://example.com/icon.png') {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
        };
      }
      return { ok: false };
    });

    const { cacheCatalogIcons } = await import('../../../src/main/services/catalog-provider');
    const apps = [
      {
        id: 'test-app',
        name: 'Test App',
        description: 'Desc',
        source: 'https://github.com/test/app',
        version: 'latest',
        category: 'tools' as const,
        categories: [],
        icon: 'https://example.com/icon.png',
        compatibility: {},
      },
    ];

    const cached = await cacheCatalogIcons(apps);
    expect(cached[0]?.icon).toMatch(/^data:image\/png;base64,iVBORw==$/);
  });
});
