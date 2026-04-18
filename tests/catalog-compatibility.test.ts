import { describe, expect, it } from 'vitest';
import { evaluateCatalogCompatibility } from '../src/renderer/catalog-compatibility';

const app = {
  id: 'erpnext',
  name: 'ERPNext',
  description: 'ERP app',
  source: 'https://github.com/frappe/erpnext',
  version: '15.0.0',
  compatibility: {
    minimumFrappeVersion: '15.0.0',
    maximumFrappeVersion: '15.2.0',
    supportedRuntimes: ['docker', 'podman'] as const,
  },
};

describe('catalog compatibility', () => {
  it('blocks unsupported runtimes', () => {
    const result = evaluateCatalogCompatibility(
      {
        ...app,
        compatibility: { ...app.compatibility, supportedRuntimes: ['docker'] },
      },
      { runtime: 'podman', frappeVersion: '15.0.0' }
    );

    expect(result.status).toBe('blocked');
    expect(result.isCompatible).toBe(false);
  });

  it('blocks older frappe versions', () => {
    const result = evaluateCatalogCompatibility(app, { runtime: 'docker', frappeVersion: '14.0.0' });

    expect(result.status).toBe('blocked');
  });

  it('warns when frappe version exceeds validated range', () => {
    const result = evaluateCatalogCompatibility(app, { runtime: 'docker', frappeVersion: '16.0.0' });

    expect(result.status).toBe('warning');
    expect(result.isCompatible).toBe(true);
  });
});
