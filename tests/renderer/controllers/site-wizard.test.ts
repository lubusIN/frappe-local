import { describe, expect, it } from 'vitest';
import {
  buildSiteCreatePayload,
  getSiteWizardStepErrors,
  isValidSiteName,
  suggestSitePath,
  toSiteDomain,
} from '../../../src/renderer/controllers/site-wizard';

describe('site wizard helpers', () => {
  it('validates supported site name format', () => {
    expect(isValidSiteName('demo-site')).toBe(true);
    expect(isValidSiteName('demo.localhost')).toBe(false);
    expect(isValidSiteName('Demo Local')).toBe(false);
  });

  it('suggests bench-aware site path', () => {
    expect(suggestSitePath('/Users/dev/frappe-bench/', 'demo-site')).toBe(
      '/Users/dev/frappe-bench/sites/demo-site.localhost'
    );
  });

  it('derives localhost domain from slug', () => {
    expect(toSiteDomain('Demo-Site')).toBe('demo-site.localhost');
  });

  it('returns step errors for missing bench and invalid site fields', () => {
    const draft = {
      benchId: '',
      name: 'Demo Local',
      path: '',
    };

    expect(getSiteWizardStepErrors(1, draft)).toEqual(['Select a bench to continue.']);
    expect(getSiteWizardStepErrors(2, draft)).toEqual([
      'Site name must be a lowercase slug with letters, numbers, and hyphens only.',
      'Enter a site path.',
    ]);
  });

  it('treats confirm step as non-blocking validation step', () => {
    const draft = {
      benchId: 'bench-001',
      name: 'demo-site',
      path: '/Users/dev/frappe-bench/sites/demo.localhost',
    };

    expect(getSiteWizardStepErrors(3, draft)).toEqual([]);
  });

  it('builds create payload when draft is valid', () => {
    const draft = {
      benchId: 'bench-001',
      name: 'demo-site',
      path: '/Users/dev/frappe-bench/sites/demo-site.localhost',
    };

    const result = buildSiteCreatePayload(draft);

    expect(result.errors).toEqual([]);
    expect(result.payload).toEqual({
      benchId: 'bench-001',
      name: 'demo-site.localhost',
      path: '/Users/dev/frappe-bench/sites/demo-site.localhost',
      apps: ['frappe'],
      force: false,
    });
  });

  it('normalizes local domains to localhost and avoids duplicate local suffixes', () => {
    const result = buildSiteCreatePayload({
      benchId: 'bench-001',
      name: 'my-site',
      path: '/Users/dev/frappe-bench/sites/my-site',
    });

    expect(result.payload).toEqual({
      benchId: 'bench-001',
      name: 'my-site.localhost',
      path: '/Users/dev/frappe-bench/sites/my-site.localhost',
      apps: ['frappe'],
      force: false,
    });
  });
});
