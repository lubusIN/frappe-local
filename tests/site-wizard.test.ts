import { describe, expect, it } from 'vitest';
import {
  buildSiteCreatePayload,
  getSiteWizardStepErrors,
  isValidSiteName,
  parseAppsText,
  suggestSitePath,
} from '../src/renderer/site-wizard';

describe('site wizard helpers', () => {
  it('normalizes apps text into trimmed array', () => {
    expect(parseAppsText(' frappe, erpnext ,, payments ')).toEqual(['frappe', 'erpnext', 'payments']);
  });

  it('validates supported site name format', () => {
    expect(isValidSiteName('demo.localhost')).toBe(true);
    expect(isValidSiteName('Demo Local')).toBe(false);
  });

  it('suggests bench-aware site path', () => {
    expect(suggestSitePath('/Users/dev/frappe-bench/', 'demo.localhost')).toBe(
      '/Users/dev/frappe-bench/sites/demo.localhost'
    );
  });

  it('returns step errors for missing bench and invalid site fields', () => {
    const draft = {
      benchId: '',
      name: 'Demo Local',
      path: '',
      groupId: '',
      appsText: '',
    };

    expect(getSiteWizardStepErrors(1, draft)).toEqual(['Select a bench to continue.']);
    expect(getSiteWizardStepErrors(2, draft)).toEqual([
      'Site name can include lowercase letters, numbers, dots, and hyphens only.',
      'Enter a site path.',
    ]);
  });

  it('builds create payload when draft is valid', () => {
    const draft = {
      benchId: 'bench-001',
      name: 'demo.localhost',
      path: '/Users/dev/frappe-bench/sites/demo.localhost',
      groupId: 'group-001',
      appsText: 'frappe, erpnext',
    };

    const result = buildSiteCreatePayload(draft);

    expect(result.errors).toEqual([]);
    expect(result.payload).toEqual({
      benchId: 'bench-001',
      name: 'demo.localhost',
      path: '/Users/dev/frappe-bench/sites/demo.localhost',
      groupId: 'group-001',
      apps: ['frappe', 'erpnext'],
    });
  });

  it('prefers selected apps from picker when present', () => {
    const result = buildSiteCreatePayload({
      benchId: 'bench-001',
      name: 'demo.localhost',
      path: '/Users/dev/frappe-bench/sites/demo.localhost',
      groupId: '',
      appsText: 'legacy-text-app',
      appsSelected: ['frappe', 'erpnext'],
    });

    expect(result.payload?.apps).toEqual(['frappe', 'erpnext']);
  });
});
