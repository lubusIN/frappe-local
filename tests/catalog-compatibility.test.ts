import { describe, expect, it } from 'vitest';
import { evaluateCatalogCompatibility } from '../src/renderer/catalog-compatibility';

const app = {
  id: 'erpnext',
  name: 'ERPNext',
  description: 'ERP app',
  source: 'https://github.com/frappe/erpnext',
  version: '15.0.0',
  category: 'business',
  compatibility: {
    minimumFrappeVersion: '15.0.0',
    maximumFrappeVersion: '15.2.0',
    
  },
};

describe('catalog compatibility', () => {


  it('blocks older frappe versions', () => {
    const result = evaluateCatalogCompatibility(app as any, { frappeVersion: '14.0.0' });

    expect(result.status).toBe('blocked');
  });

  it('warns when frappe version exceeds validated range', () => {
    const result = evaluateCatalogCompatibility(app as any, { frappeVersion: '16.0.0' });

    expect(result.status).toBe('warning');
    expect(result.isCompatible).toBe(true);
  });
});
